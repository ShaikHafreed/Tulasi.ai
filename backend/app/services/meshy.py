import asyncio
import base64
import logging
import os
import shutil
import time
from pathlib import Path

import httpx

from .. import character_store, job_store, supabase_client
from ..models.schemas import AnimationPreset, ErrorDetail, JobStatus

logger = logging.getLogger("tulasi.meshy")

MESHY_API_BASE = "https://api.meshy.ai/openapi/v1"
STORAGE_DIR = Path(__file__).resolve().parent.parent.parent / "storage"
FIXTURE_GLB = Path(__file__).resolve().parent.parent.parent.parent / "experiments" / "fixtures" / "sample.glb"

POLL_INTERVAL_SECONDS = 5
JOB_TIMEOUT_SECONDS = 600
RETRY_DELAYS = (1, 2, 4)


def _mock_enabled() -> bool:
    return os.environ.get("MOCK_MESHY") == "1"


def _api_key() -> str:
    key = os.environ.get("MESHY_API_KEY")
    if not key:
        raise RuntimeError("MESHY_API_KEY is not set")
    return key


def _stage_for_progress(progress: int) -> str:
    if progress >= 85:
        return "Texturing"
    if progress >= 50:
        return "Building geometry"
    return "Analyzing photo"


async def _request_with_retry(method: str, url: str, **kwargs) -> httpx.Response:
    """Retry on 5xx AND on transport-level failures (DNS, TLS handshake,
    resets, timeouts) with the same 1s/2s/4s backoff. Transport errors were
    originally not retried, so one flaky-network blip mid-poll failed the
    whole job — live-observed as httpx.ConnectError during start_tls."""
    response: httpx.Response | None = None
    last_transport_error: httpx.TransportError | None = None
    for delay in (0, *RETRY_DELAYS):
        if delay:
            await asyncio.sleep(delay)
        try:
            async with httpx.AsyncClient(timeout=60) as client:
                response = await client.request(method, url, **kwargs)
        except httpx.TransportError as exc:
            last_transport_error = exc
            logger.warning("transient network error for %s %s: %r — retrying", method, url, exc)
            continue
        if response.status_code < 500:
            return response
    if response is None:
        raise RuntimeError(f"{method} {url} kept failing: {last_transport_error!r}")
    raise RuntimeError(f"{method} {url} kept failing: {response.status_code} {response.text}")


def _data_uri(image_bytes: bytes, content_type: str) -> str:
    return f"data:{content_type};base64,{base64.b64encode(image_bytes).decode()}"


async def _create_task(images: list[tuple[bytes, str]]) -> tuple[str, str]:
    """Creates a Meshy task from 1–4 images. A single image uses the cheaper
    image-to-3d endpoint; multiple images use multi-image-to-3d (better
    geometry from several angles). Returns (task_id, endpoint) so polling hits
    the matching endpoint."""
    uris = [_data_uri(image_bytes, content_type) for image_bytes, content_type in images]
    if len(uris) == 1:
        endpoint = "image-to-3d"
        body: dict = {"image_url": uris[0], "enable_pbr": False}
    else:
        endpoint = "multi-image-to-3d"
        body = {"image_urls": uris, "enable_pbr": False}

    response = await _request_with_retry(
        "POST",
        f"{MESHY_API_BASE}/{endpoint}",
        headers={"Authorization": f"Bearer {_api_key()}"},
        json=body,
    )
    if response.status_code >= 400:
        raise RuntimeError(f"Meshy task creation failed: {response.status_code} {response.text}")
    return response.json()["result"], endpoint


async def _get_task(task_id: str, endpoint: str) -> dict:
    response = await _request_with_retry(
        "GET",
        f"{MESHY_API_BASE}/{endpoint}/{task_id}",
        headers={"Authorization": f"Bearer {_api_key()}"},
    )
    if response.status_code >= 400:
        raise RuntimeError(f"Meshy task lookup failed: {response.status_code} {response.text}")
    return response.json()


async def _download_glb(url: str, job_id: str) -> str:
    """Download with the same retry policy as API calls — a multi-MB GLB
    over a flaky connection can drop mid-stream (live-observed ReadError on
    the last of three rig downloads), and that must not fail the job."""
    STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    dest = STORAGE_DIR / f"{job_id}.glb"
    last_error: Exception | None = None
    for delay in (0, *RETRY_DELAYS):
        if delay:
            await asyncio.sleep(delay)
        try:
            async with httpx.AsyncClient(timeout=120) as client:
                response = await client.get(url)
                response.raise_for_status()
                dest.write_bytes(response.content)
            return f"/storage/{job_id}.glb"
        except (httpx.TransportError, httpx.HTTPStatusError) as exc:
            last_error = exc
            logger.warning("download failed for %s: %r — retrying", job_id, exc)
    raise RuntimeError(f"GLB download kept failing for {job_id}: {last_error!r}")


async def _run_mock(job_id: str) -> None:
    STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    dest = STORAGE_DIR / f"{job_id}.glb"
    for progress in (20, 55, 90):
        job_store.update(job_id, status=JobStatus.PROCESSING, stage=_stage_for_progress(progress))
        await asyncio.sleep(0.5)
    shutil.copyfile(FIXTURE_GLB, dest)
    job_store.update(
        job_id,
        status=JobStatus.SUCCEEDED,
        stage="Texturing",
        model_url=f"/storage/{job_id}.glb",
    )


async def _run_real(job_id: str, images: list[tuple[bytes, str]]) -> None:
    task_id, endpoint = await _create_task(images)
    job_store.update(job_id, meshy_task_id=task_id)
    deadline = time.monotonic() + JOB_TIMEOUT_SECONDS

    while time.monotonic() < deadline:
        payload = await _get_task(task_id, endpoint)
        status = payload.get("status")
        progress = payload.get("progress") or 0

        if status == "SUCCEEDED":
            model_url = (payload.get("model_urls") or {}).get("glb")
            if not model_url:
                raise RuntimeError("Meshy reported success with no glb url")
            local_url = await _download_glb(model_url, job_id)
            job_store.update(job_id, status=JobStatus.SUCCEEDED, stage="Texturing", model_url=local_url)
            return

        if status in ("FAILED", "CANCELED"):
            raise RuntimeError(f"Meshy job {status.lower()}")

        job_store.update(job_id, status=JobStatus.PROCESSING, stage=_stage_for_progress(progress))
        await asyncio.sleep(POLL_INTERVAL_SECONDS)

    raise TimeoutError("Meshy job timed out")


async def process_job(job_id: str, images: list[tuple[bytes, str]], access_token: str | None) -> None:
    try:
        if _mock_enabled():
            # Mock ignores the image count entirely — it just serves the
            # fixture — so multiple photos never error in mock mode.
            await _run_mock(job_id)
        else:
            await _run_real(job_id, images)
    except TimeoutError:
        logger.warning("job %s timed out", job_id)
        job_store.update(
            job_id,
            status=JobStatus.FAILED,
            stage="Failed",
            error=ErrorDetail(
                error_code="timeout",
                human_message="Generating this model is taking too long.",
                suggested_action="Try again — if it keeps happening, try a simpler photo.",
            ),
        )
        return
    except Exception:
        logger.exception("job %s failed", job_id)
        job_store.update(
            job_id,
            status=JobStatus.FAILED,
            stage="Failed",
            error=ErrorDetail(
                error_code="meshy_error",
                human_message="We couldn't generate a 3D model from that photo.",
                suggested_action="Try a clearer, well-lit photo of the object on a plain background.",
            ),
        )
        return

    if access_token:
        record = job_store.get(job_id)
        if record and record.model_url:
            dimensions = record.dimensions
            try:
                supabase_client.insert_scan(
                    access_token,
                    job_id=job_id,
                    model_url=record.model_url,
                    image_url=record.image_url,
                    # At insert time record.image_url is still the source photo
                    # (the thumbnail render overwrites image_url later) — keep a
                    # permanent copy of it for the before/after slider.
                    source_image_url=record.image_url,
                    width_mm=dimensions.width_mm if dimensions else None,
                    height_mm=dimensions.height_mm if dimensions else None,
                    depth_mm=dimensions.depth_mm if dimensions else None,
                    depth_estimated=dimensions.depth_estimated if dimensions else True,
                )
            except Exception:
                # Scan-history write failing shouldn't hide a model that generated fine.
                logger.exception("scan history write failed for job %s", job_id)


# ---------------------------------------------------------------------------
# Rigging & animation (character models only — see docs.meshy.ai/api/rigging:
# "only works well with standard humanoid (bipedal) [or quadruped] assets
# with clearly defined limbs". This is NOT applicable to the static printable
# objects Tulasi normally generates (mugs, brackets, hinges) — it's an
# explicit opt-in action the user takes knowing it costs real credits and
# may simply be rejected by Meshy for non-character geometry.
# ---------------------------------------------------------------------------

RIG_TIMEOUT_SECONDS = 300

# A curated subset of Meshy's 500+ animation presets (docs.meshy.ai/api/animation-library).
ANIMATION_PRESETS = [
    AnimationPreset(action_id=0, name="Idle", label="Idle"),
    AnimationPreset(action_id=1, name="Walking_Woman", label="Walk"),
    AnimationPreset(action_id=16, name="RunFast", label="Run fast"),
    AnimationPreset(action_id=22, name="FunnyDancing_01", label="Funny dance"),
    AnimationPreset(action_id=25, name="Agree_Gesture", label="Nod / agree"),
    AnimationPreset(action_id=28, name="Big_Wave_Hello", label="Wave hello"),
    AnimationPreset(action_id=41, name="Formal_Bow", label="Formal bow"),
    AnimationPreset(action_id=44, name="Happy_jump_f", label="Happy jump"),
    AnimationPreset(action_id=49, name="Motivational_Cheer", label="Cheer"),
]


class NotACharacterModelError(Exception):
    """Meshy rejected this model as not humanoid/quadruped enough to rig —
    raised whether that rejection happened at task-creation time (a 4xx,
    e.g. the real-world "422 Pose estimation failed") or asynchronously
    (a FAILED status after polling)."""


class FaceLimitExceededError(Exception):
    """Meshy refuses to rig models over 300,000 faces. Live-verified real
    response: `400 {"message":"The input model has 310160 faces which
    exceeds the 300,000 face limit for rigging. Please use the Remesh API
    ..."}`. Recoverable — remesh to a lower polycount, then rig that."""


# Meshy's actual API error text doesn't match its docs page's prose
# ("non-humanoid", "unclear limb structure") — live-verified real response:
# `422 {"message":"Pose estimation failed, please provide a valid model"}`.
# Keep both sets of keywords since Meshy's wording isn't guaranteed stable.
_REJECTION_KEYWORDS = (
    "humanoid",
    "quadruped",
    "limb",
    "not suitable",
    "pose estimation",
    "valid model",
)


def _looks_like_character_rejection(text: str) -> bool:
    lowered = text.lower()
    return any(keyword in lowered for keyword in _REJECTION_KEYWORDS)


def _looks_like_face_limit_error(text: str) -> bool:
    lowered = text.lower()
    return "face" in lowered and ("exceed" in lowered or "limit" in lowered)


async def _create_rigging_task(input_task_id: str, height_meters: float) -> str:
    response = await _request_with_retry(
        "POST",
        f"{MESHY_API_BASE}/rigging",
        headers={"Authorization": f"Bearer {_api_key()}"},
        json={"input_task_id": input_task_id, "height_meters": height_meters},
    )
    if response.status_code >= 400:
        if _looks_like_face_limit_error(response.text):
            raise FaceLimitExceededError(response.text)
        if _looks_like_character_rejection(response.text):
            raise NotACharacterModelError(response.text)
        raise RuntimeError(f"Meshy rigging task creation failed: {response.status_code} {response.text}")
    return response.json()["result"]


# Rigging rejects models over 300k faces; remesh well below the cap — 100k
# keeps plenty of detail for an animated character while leaving headroom.
REMESH_TARGET_POLYCOUNT = 100_000
REMESH_TIMEOUT_SECONDS = 300


async def _create_remesh_task(input_task_id: str, target_polycount: int) -> str:
    response = await _request_with_retry(
        "POST",
        f"{MESHY_API_BASE}/remesh",
        headers={"Authorization": f"Bearer {_api_key()}"},
        json={
            "input_task_id": input_task_id,
            "target_formats": ["glb"],
            "topology": "triangle",
            "target_polycount": target_polycount,
        },
    )
    if response.status_code >= 400:
        raise RuntimeError(f"Meshy remesh task creation failed: {response.status_code} {response.text}")
    return response.json()["result"]


async def _get_remesh_task(task_id: str) -> dict:
    response = await _request_with_retry(
        "GET",
        f"{MESHY_API_BASE}/remesh/{task_id}",
        headers={"Authorization": f"Bearer {_api_key()}"},
    )
    if response.status_code >= 400:
        raise RuntimeError(f"Meshy remesh task lookup failed: {response.status_code} {response.text}")
    return response.json()


async def _run_remesh(input_task_id: str) -> str:
    """Simplify an over-the-face-limit model and return the remesh task id,
    which the Rigging API accepts as an input task."""
    remesh_task_id = await _create_remesh_task(input_task_id, REMESH_TARGET_POLYCOUNT)
    deadline = time.monotonic() + REMESH_TIMEOUT_SECONDS

    while time.monotonic() < deadline:
        payload = await _get_remesh_task(remesh_task_id)
        status = payload.get("status")
        if status == "SUCCEEDED":
            return remesh_task_id
        if status in ("FAILED", "CANCELED"):
            task_error = (payload.get("task_error") or {}).get("message", "")
            raise RuntimeError(f"Meshy remesh {status.lower()}: {task_error}")
        await asyncio.sleep(POLL_INTERVAL_SECONDS)

    raise TimeoutError("Meshy remesh timed out")


async def _get_rigging_task(task_id: str) -> dict:
    response = await _request_with_retry(
        "GET",
        f"{MESHY_API_BASE}/rigging/{task_id}",
        headers={"Authorization": f"Bearer {_api_key()}"},
    )
    if response.status_code >= 400:
        raise RuntimeError(f"Meshy rigging task lookup failed: {response.status_code} {response.text}")
    return response.json()


async def _create_animation_task(rig_task_id: str, action_id: int) -> str:
    response = await _request_with_retry(
        "POST",
        f"{MESHY_API_BASE}/animations",
        headers={"Authorization": f"Bearer {_api_key()}"},
        json={"rig_task_id": rig_task_id, "action_id": action_id},
    )
    if response.status_code >= 400:
        raise RuntimeError(f"Meshy animation task creation failed: {response.status_code} {response.text}")
    return response.json()["result"]


async def _get_animation_task(task_id: str) -> dict:
    response = await _request_with_retry(
        "GET",
        f"{MESHY_API_BASE}/animations/{task_id}",
        headers={"Authorization": f"Bearer {_api_key()}"},
    )
    if response.status_code >= 400:
        raise RuntimeError(f"Meshy animation task lookup failed: {response.status_code} {response.text}")
    return response.json()


def _humanoid_rejection_error() -> ErrorDetail:
    return ErrorDetail(
        error_code="not_a_character_model",
        human_message="Meshy couldn't rig this model — rigging only works on humanoid or quadruped character shapes with clear limbs.",
        suggested_action="This works for character-like scans, not everyday objects like mugs, brackets, or hinges.",
    )


async def process_rig_job(rig_id: str, meshy_task_id: str, height_meters: float) -> None:
    try:
        if _mock_enabled():
            raise RuntimeError("Rigging isn't available in mock mode — needs a real Meshy generation task.")

        try:
            rig_task_id = await _create_rigging_task(meshy_task_id, height_meters)
        except FaceLimitExceededError:
            # Model is too detailed to rig directly — simplify it first,
            # then rig the simplified copy. Costs extra credits but turns a
            # hard failure into the thing the user actually asked for.
            logger.info("rig %s: model over the face limit, remeshing first", rig_id)
            character_store.update_rig(rig_id, status=JobStatus.PROCESSING)
            remesh_task_id = await _run_remesh(meshy_task_id)
            rig_task_id = await _create_rigging_task(remesh_task_id, height_meters)
        character_store.update_rig(rig_id, meshy_rig_task_id=rig_task_id, status=JobStatus.PROCESSING)
        deadline = time.monotonic() + RIG_TIMEOUT_SECONDS

        while time.monotonic() < deadline:
            payload = await _get_rigging_task(rig_task_id)
            status = payload.get("status")

            if status == "SUCCEEDED":
                result = payload.get("result") or {}
                rigged_url = result.get("rigged_character_glb_url")
                if not rigged_url:
                    raise RuntimeError("Meshy reported rigging success with no glb url")
                rigged_local = await _download_glb(rigged_url, f"{rig_id}_rigged")

                # Walking/running are bonus extras — if their download dies
                # even after retries, the rig itself still succeeded and
                # must be reported as such, not thrown away.
                basic = result.get("basic_animations") or {}

                async def _optional_download(key: str, suffix: str) -> str | None:
                    url = basic.get(key)
                    if not url:
                        return None
                    try:
                        return await _download_glb(url, f"{rig_id}{suffix}")
                    except Exception:
                        logger.warning("optional %s download failed for rig %s", key, rig_id)
                        return None

                walking_local = await _optional_download("walking_glb_url", "_walking")
                running_local = await _optional_download("running_glb_url", "_running")
                character_store.update_rig(
                    rig_id,
                    status=JobStatus.SUCCEEDED,
                    rigged_model_url=rigged_local,
                    walking_url=walking_local,
                    running_url=running_local,
                )
                return

            if status in ("FAILED", "CANCELED"):
                task_error = (payload.get("task_error") or {}).get("message", "")
                if _looks_like_character_rejection(task_error):
                    raise NotACharacterModelError(task_error)
                raise RuntimeError(f"Meshy rigging {status.lower()}: {task_error}")

            await asyncio.sleep(POLL_INTERVAL_SECONDS)

        raise TimeoutError("Meshy rigging timed out")

    except NotACharacterModelError as exc:
        logger.info("rig %s rejected as non-character: %s", rig_id, exc)
        character_store.update_rig(rig_id, status=JobStatus.FAILED, error=_humanoid_rejection_error())
    except TimeoutError:
        logger.warning("rig %s timed out", rig_id)
        character_store.update_rig(
            rig_id,
            status=JobStatus.FAILED,
            error=ErrorDetail(
                error_code="timeout",
                human_message="Rigging this model is taking too long.",
                suggested_action="Try again in a moment.",
            ),
        )
    except Exception:
        # Deliberately worded differently from _humanoid_rejection_error() —
        # this is an unexpected failure (network, auth, a Meshy-side bug),
        # not a confirmed "not a character" rejection, and the two should
        # never look identical in the UI or logs.
        logger.exception("rig %s failed unexpectedly", rig_id)
        character_store.update_rig(
            rig_id,
            status=JobStatus.FAILED,
            error=ErrorDetail(
                error_code="rigging_failed",
                human_message="Something went wrong reaching Meshy while rigging this model.",
                suggested_action="Try again in a moment — if it keeps happening, this model may not be rigable.",
            ),
        )


async def process_animation_job(animation_id: str, meshy_rig_task_id: str, action_id: int) -> None:
    try:
        task_id = await _create_animation_task(meshy_rig_task_id, action_id)
        deadline = time.monotonic() + RIG_TIMEOUT_SECONDS

        while time.monotonic() < deadline:
            payload = await _get_animation_task(task_id)
            status = payload.get("status")

            if status == "SUCCEEDED":
                result = payload.get("result") or {}
                animation_url = result.get("animation_glb_url")
                if not animation_url:
                    raise RuntimeError("Meshy reported animation success with no glb url")
                local_url = await _download_glb(animation_url, f"{animation_id}_anim")
                character_store.update_animation(animation_id, status=JobStatus.SUCCEEDED, animation_url=local_url)
                return

            if status in ("FAILED", "CANCELED"):
                raise RuntimeError(f"Meshy animation {status.lower()}")

            await asyncio.sleep(POLL_INTERVAL_SECONDS)

        raise TimeoutError("Meshy animation timed out")

    except TimeoutError:
        logger.warning("animation %s timed out", animation_id)
        character_store.update_animation(
            animation_id,
            status=JobStatus.FAILED,
            error=ErrorDetail(
                error_code="timeout",
                human_message="Generating this animation is taking too long.",
                suggested_action="Try again in a moment.",
            ),
        )
    except Exception:
        logger.exception("animation %s failed", animation_id)
        character_store.update_animation(
            animation_id,
            status=JobStatus.FAILED,
            error=ErrorDetail(
                error_code="animation_failed",
                human_message="Couldn't generate that animation.",
                suggested_action="Try a different preset or try again.",
            ),
        )

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
    response: httpx.Response | None = None
    for delay in (0, *RETRY_DELAYS):
        if delay:
            await asyncio.sleep(delay)
        async with httpx.AsyncClient(timeout=60) as client:
            response = await client.request(method, url, **kwargs)
        if response.status_code < 500:
            return response
    assert response is not None
    raise RuntimeError(f"{method} {url} kept failing: {response.status_code} {response.text}")


async def _create_task(image_bytes: bytes, content_type: str) -> str:
    data_uri = f"data:{content_type};base64,{base64.b64encode(image_bytes).decode()}"
    response = await _request_with_retry(
        "POST",
        f"{MESHY_API_BASE}/image-to-3d",
        headers={"Authorization": f"Bearer {_api_key()}"},
        json={"image_url": data_uri, "enable_pbr": False},
    )
    if response.status_code >= 400:
        raise RuntimeError(f"Meshy task creation failed: {response.status_code} {response.text}")
    return response.json()["result"]


async def _get_task(task_id: str) -> dict:
    response = await _request_with_retry(
        "GET",
        f"{MESHY_API_BASE}/image-to-3d/{task_id}",
        headers={"Authorization": f"Bearer {_api_key()}"},
    )
    if response.status_code >= 400:
        raise RuntimeError(f"Meshy task lookup failed: {response.status_code} {response.text}")
    return response.json()


async def _download_glb(url: str, job_id: str) -> str:
    STORAGE_DIR.mkdir(parents=True, exist_ok=True)
    dest = STORAGE_DIR / f"{job_id}.glb"
    async with httpx.AsyncClient(timeout=60) as client:
        response = await client.get(url)
        response.raise_for_status()
        dest.write_bytes(response.content)
    return f"/storage/{job_id}.glb"


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


async def _run_real(job_id: str, image_bytes: bytes, content_type: str) -> None:
    task_id = await _create_task(image_bytes, content_type)
    job_store.update(job_id, meshy_task_id=task_id)
    deadline = time.monotonic() + JOB_TIMEOUT_SECONDS

    while time.monotonic() < deadline:
        payload = await _get_task(task_id)
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


async def process_job(job_id: str, image_bytes: bytes, content_type: str, access_token: str | None) -> None:
    try:
        if _mock_enabled():
            await _run_mock(job_id)
        else:
            await _run_real(job_id, image_bytes, content_type)
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


async def _create_rigging_task(input_task_id: str, height_meters: float) -> str:
    response = await _request_with_retry(
        "POST",
        f"{MESHY_API_BASE}/rigging",
        headers={"Authorization": f"Bearer {_api_key()}"},
        json={"input_task_id": input_task_id, "height_meters": height_meters},
    )
    if response.status_code >= 400:
        raise RuntimeError(f"Meshy rigging task creation failed: {response.status_code} {response.text}")
    return response.json()["result"]


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

        rig_task_id = await _create_rigging_task(meshy_task_id, height_meters)
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
                basic = result.get("basic_animations") or {}
                walking_local = (
                    await _download_glb(basic["walking_glb_url"], f"{rig_id}_walking")
                    if basic.get("walking_glb_url")
                    else None
                )
                running_local = (
                    await _download_glb(basic["running_glb_url"], f"{rig_id}_running")
                    if basic.get("running_glb_url")
                    else None
                )
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
                if "humanoid" in task_error.lower() or "non-humanoid" in task_error.lower():
                    character_store.update_rig(rig_id, status=JobStatus.FAILED, error=_humanoid_rejection_error())
                    return
                raise RuntimeError(f"Meshy rigging {status.lower()}: {task_error}")

            await asyncio.sleep(POLL_INTERVAL_SECONDS)

        raise TimeoutError("Meshy rigging timed out")

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
        logger.exception("rig %s failed", rig_id)
        character_store.update_rig(
            rig_id,
            status=JobStatus.FAILED,
            error=ErrorDetail(
                error_code="rigging_failed",
                human_message="Couldn't rig this model.",
                suggested_action="This works best on humanoid or quadruped character scans.",
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

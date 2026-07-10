import asyncio
import base64
import logging
import os
import shutil
import time
from pathlib import Path

import httpx

from .. import job_store, supabase_client
from ..models.schemas import ErrorDetail, JobStatus

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
                    width_mm=dimensions.width_mm if dimensions else None,
                    height_mm=dimensions.height_mm if dimensions else None,
                    depth_mm=dimensions.depth_mm if dimensions else None,
                    depth_estimated=dimensions.depth_estimated if dimensions else True,
                )
            except Exception:
                # Scan-history write failing shouldn't hide a model that generated fine.
                logger.exception("scan history write failed for job %s", job_id)

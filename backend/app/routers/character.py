import asyncio
import uuid

from fastapi import APIRouter

from .. import character_store, job_store
from ..errors import AppError
from ..models.schemas import (
    AnimatePresetRequest,
    AnimateAccepted,
    AnimationPreset,
    AnimationRecord,
    RigAccepted,
    RigRecord,
    RigRequest,
)
from ..services import meshy

router = APIRouter(prefix="/api/character", tags=["character"])

_background_tasks: set[asyncio.Task] = set()


def _track(task: asyncio.Task) -> None:
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)


@router.get("/presets", response_model=list[AnimationPreset])
async def list_presets() -> list[AnimationPreset]:
    return meshy.ANIMATION_PRESETS


@router.post("/rig", status_code=202, response_model=RigAccepted)
async def rig(body: RigRequest) -> RigAccepted:
    job = job_store.get(body.job_id)
    if not job or not job.meshy_task_id:
        raise AppError(
            status_code=400,
            error_code="no_meshy_task",
            human_message="This scan can't be rigged.",
            suggested_action="Rigging needs a real (non-mock) generation to reference.",
        )

    rig_id = uuid.uuid4().hex
    character_store.create_rig(rig_id)
    _track(asyncio.create_task(meshy.process_rig_job(rig_id, job.meshy_task_id, body.height_meters)))
    return RigAccepted(rig_id=rig_id)


@router.get("/rig/{rig_id}", response_model=RigRecord)
async def get_rig(rig_id: str) -> RigRecord:
    record = character_store.get_rig(rig_id)
    if not record:
        raise AppError(
            status_code=404,
            error_code="rig_not_found",
            human_message="That rigging job doesn't exist.",
            suggested_action="",
        )
    return record


@router.post("/animate", status_code=202, response_model=AnimateAccepted)
async def animate(body: AnimatePresetRequest) -> AnimateAccepted:
    rig_record = character_store.get_rig(body.rig_id)
    if not rig_record or not rig_record.meshy_rig_task_id:
        raise AppError(
            status_code=400,
            error_code="rig_not_ready",
            human_message="This model isn't rigged yet.",
            suggested_action="Wait for rigging to finish first.",
        )

    animation_id = uuid.uuid4().hex
    character_store.create_animation(animation_id)
    _track(
        asyncio.create_task(
            meshy.process_animation_job(animation_id, rig_record.meshy_rig_task_id, body.action_id)
        )
    )
    return AnimateAccepted(animation_id=animation_id)


@router.get("/animate/{animation_id}", response_model=AnimationRecord)
async def get_animation(animation_id: str) -> AnimationRecord:
    record = character_store.get_animation(animation_id)
    if not record:
        raise AppError(
            status_code=404,
            error_code="animation_not_found",
            human_message="That animation job doesn't exist.",
            suggested_action="",
        )
    return record

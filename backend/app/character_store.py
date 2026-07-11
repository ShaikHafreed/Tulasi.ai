from .models.schemas import AnimationRecord, JobStatus, RigRecord

_rigs: dict[str, RigRecord] = {}
_animations: dict[str, AnimationRecord] = {}


def create_rig(rig_id: str) -> None:
    _rigs[rig_id] = RigRecord(status=JobStatus.PENDING)


def update_rig(rig_id: str, **fields) -> None:
    _rigs[rig_id] = _rigs[rig_id].model_copy(update=fields)


def get_rig(rig_id: str) -> RigRecord | None:
    return _rigs.get(rig_id)


def create_animation(animation_id: str) -> None:
    _animations[animation_id] = AnimationRecord(status=JobStatus.PENDING)


def update_animation(animation_id: str, **fields) -> None:
    _animations[animation_id] = _animations[animation_id].model_copy(update=fields)


def get_animation(animation_id: str) -> AnimationRecord | None:
    return _animations.get(animation_id)

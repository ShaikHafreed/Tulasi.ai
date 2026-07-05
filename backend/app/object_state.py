"""In-memory store for the assistant's view of an object's current dimensions."""

_state: dict[str, dict] = {}


def get(job_id: str) -> dict:
    return _state.get(job_id, {})


def update(job_id: str, **fields) -> dict:
    current = dict(_state.get(job_id, {}))
    current.update({key: value for key, value in fields.items() if value is not None})
    _state[job_id] = current
    return current

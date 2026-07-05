"""Claude tool-use assistant: set_dimensions, rotate_view, run_print_check,
export_model, explain_object. All Anthropic API calls live here.

See .claude/skills/claude-api (Anthropic's own skill) for SDK usage details.
"""

import json
import os

import anthropic
import trimesh

from . import meshy
from .. import job_store, object_state

MODEL = "claude-opus-4-8"
MAX_TOOL_ITERATIONS = 5

SYSTEM_PROMPT = (
    "You are Tulasi's assistant, helping a user inspect and adjust a "
    "3D-scanned object. Use the available tools to act on the model — every "
    "action you take should visibly update what the user sees. Call "
    "explain_object first if you need grounded facts before answering, "
    "rather than guessing."
)

TOOLS = [
    {
        "name": "set_dimensions",
        "description": (
            "Set the object's real-world width, height, and/or depth in "
            "millimeters. Call this when the user asks to resize the object "
            "or make it fit a specific measurement."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "width_mm": {"type": "number", "description": "New width in mm"},
                "height_mm": {"type": "number", "description": "New height in mm"},
                "depth_mm": {"type": "number", "description": "New depth in mm"},
            },
        },
    },
    {
        "name": "rotate_view",
        "description": (
            "Rotate the 3D viewer's camera. Call this when the user asks to "
            "see the object from a different angle."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "yaw_degrees": {"type": "number", "description": "Horizontal rotation in degrees"},
                "pitch_degrees": {"type": "number", "description": "Vertical rotation in degrees"},
            },
        },
    },
    {
        "name": "run_print_check",
        "description": (
            "Check whether the current 3D model is likely printable. Call "
            "this when the user asks if the object can be 3D printed."
        ),
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "export_model",
        "description": (
            "Export the current 3D model to a downloadable file. Call this "
            "when the user asks to export or download the model."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "format": {
                    "type": "string",
                    "enum": ["glb", "stl"],
                    "description": "Export file format",
                },
            },
            "required": ["format"],
        },
    },
    {
        "name": "explain_object",
        "description": (
            "Look up what is currently known about the scanned object "
            "(status, measured dimensions). Call this before explaining the "
            "object to the user so your answer is grounded in real data."
        ),
        "input_schema": {"type": "object", "properties": {}},
    },
]


def _client() -> anthropic.Anthropic:
    key = os.environ.get("ANTHROPIC_API_KEY")
    if not key:
        raise RuntimeError("ANTHROPIC_API_KEY is not set")
    return anthropic.Anthropic(api_key=key)


def _execute_set_dimensions(job_id: str, tool_input: dict) -> tuple[str, dict | None]:
    updated = object_state.update(job_id, **tool_input)
    return f"Dimensions updated: {updated}", {"type": "set_dimensions", "payload": updated}


def _execute_rotate_view(job_id: str, tool_input: dict) -> tuple[str, dict | None]:
    return "View rotation sent to the viewer.", {"type": "rotate_view", "payload": tool_input}


def _execute_run_print_check(job_id: str, tool_input: dict) -> tuple[str, dict | None]:
    glb_path = meshy.STORAGE_DIR / f"{job_id}.glb"
    if not glb_path.exists():
        return "No model found for this job yet.", None

    mesh = trimesh.load(str(glb_path), force="mesh")
    report = {
        "watertight": bool(mesh.is_watertight),
        "note": (
            "Heuristic only: watertightness is a rough proxy for printability. "
            "Wall-thickness and overhang analysis are not implemented yet."
        ),
    }
    message = f"Watertight: {report['watertight']}. {report['note']}"
    return message, {"type": "print_check", "payload": report}


def _execute_export_model(job_id: str, tool_input: dict) -> tuple[str, dict | None]:
    fmt = tool_input.get("format", "glb")
    glb_path = meshy.STORAGE_DIR / f"{job_id}.glb"
    if not glb_path.exists():
        return "No model found for this job yet.", None

    if fmt == "glb":
        url = f"/storage/{job_id}.glb"
    elif fmt == "stl":
        stl_path = meshy.STORAGE_DIR / f"{job_id}.stl"
        if not stl_path.exists():
            mesh = trimesh.load(str(glb_path), force="mesh")
            mesh.export(str(stl_path))
        url = f"/storage/{job_id}.stl"
    else:
        return f"Unsupported export format: {fmt}", None

    return f"Exported as {fmt}.", {"type": "export_ready", "payload": {"format": fmt, "url": url}}


def _execute_explain_object(job_id: str, tool_input: dict) -> tuple[str, dict | None]:
    job = job_store.get(job_id)
    facts = {
        "job_status": job.status.value if job else "unknown",
        "dimensions": object_state.get(job_id),
    }
    return json.dumps(facts), None


_HANDLERS = {
    "set_dimensions": _execute_set_dimensions,
    "rotate_view": _execute_rotate_view,
    "run_print_check": _execute_run_print_check,
    "export_model": _execute_export_model,
    "explain_object": _execute_explain_object,
}


def _execute_tool(job_id: str, name: str, tool_input: dict) -> tuple[str, dict | None]:
    handler = _HANDLERS.get(name)
    if handler is None:
        return f"Unknown tool: {name}", None
    return handler(job_id, tool_input)


def ask(job_id: str, message: str) -> dict:
    client = _client()
    messages: list = [{"role": "user", "content": message}]
    actions: list[dict] = []

    for _ in range(MAX_TOOL_ITERATIONS):
        response = client.messages.create(
            model=MODEL,
            max_tokens=1024,
            system=SYSTEM_PROMPT,
            tools=TOOLS,
            messages=messages,
        )
        messages.append({"role": "assistant", "content": response.content})

        if response.stop_reason != "tool_use":
            reply = next((block.text for block in response.content if block.type == "text"), "")
            return {"reply": reply, "actions": actions}

        tool_results = []
        for block in response.content:
            if block.type != "tool_use":
                continue
            result_text, action = _execute_tool(job_id, block.name, block.input)
            if action:
                actions.append(action)
            tool_results.append(
                {"type": "tool_result", "tool_use_id": block.id, "content": result_text}
            )
        messages.append({"role": "user", "content": tool_results})

    return {"reply": "I wasn't able to finish that within the allowed steps.", "actions": actions}

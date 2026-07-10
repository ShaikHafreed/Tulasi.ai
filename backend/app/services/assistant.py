"""Tulasi's in-app copilot. Proposes actions from the command whitelist —
it never touches app state directly, only ever returns {action, params,
reversible} for the frontend to execute via lib/tulasiCommands.ts.

MOCK_ASSISTANT=1 (the default right now — the Anthropic key has $0 credit)
uses keyword-matched canned replies instead of a real model call. The real
path below is written against the same contract so flipping the flag once
credit exists doesn't require touching the frontend at all.
"""

import os
import re

from ..models.schemas import AssistantReply, ProposedAction, TulasiEvent

MODEL = "claude-sonnet-5"

TOOLS = [
    {
        "name": "setDimensions",
        "description": "Resize the scanned object to a target width/height/depth in millimeters.",
        "input_schema": {
            "type": "object",
            "properties": {
                "width_mm": {"type": "number"},
                "height_mm": {"type": "number"},
                "depth_mm": {"type": "number"},
            },
            "required": ["width_mm", "height_mm", "depth_mm"],
        },
    },
    {
        "name": "rotateView",
        "description": "Rotate the 3D viewer's camera around the model.",
        "input_schema": {
            "type": "object",
            "properties": {
                "axis": {"type": "string", "enum": ["x", "y"]},
                "degrees": {"type": "number"},
            },
            "required": ["axis", "degrees"],
        },
    },
    {
        "name": "runPrintCheck",
        "description": "Check the current dimensions against basic FDM-printability heuristics.",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "exportModel",
        "description": "Export/download the current 3D model file.",
        "input_schema": {
            "type": "object",
            "properties": {"format": {"type": "string", "enum": ["glb"]}},
        },
    },
    {
        "name": "addReferenceHint",
        "description": "Remind the user to include a card or coin reference object and rescan.",
        "input_schema": {
            "type": "object",
            "properties": {"reference_type": {"type": "string", "enum": ["card", "coin"]}},
            "required": ["reference_type"],
        },
    },
]

REVERSIBLE = {
    "setDimensions": True,
    "rotateView": True,
    "runPrintCheck": True,
    "exportModel": False,
    "addReferenceHint": True,
}

_NUMBER_MM = re.compile(r"(\d+(?:\.\d+)?)\s*mm")


def _mock_enabled() -> bool:
    return os.environ.get("MOCK_ASSISTANT", "1") == "1"


def _latest_dimensions(events: list[TulasiEvent]) -> dict | None:
    for event in reversed(events):
        if event.type in ("dimensions_changed", "reference_detected") and event.payload:
            payload = event.payload
            if {"width_mm", "height_mm", "depth_mm"} <= payload.keys():
                return payload
    return None


def _mock_reply(message: str, events: list[TulasiEvent]) -> AssistantReply:
    text = message.lower()
    current = _latest_dimensions(events)

    if any(word in text for word in ("export", "download", "save the file", "stl")):
        return AssistantReply(
            reply="I can export the current model now — this overwrites nothing, but I'll check before running it since it produces a file.",
            proposed_actions=[
                ProposedAction(action="exportModel", params={"format": "glb"}, reversible=False)
            ],
        )

    if any(word in text for word in ("print", "printable", "sturdy", "stable", "overhang")):
        return AssistantReply(
            reply="Let me check the current dimensions against basic printability heuristics.",
            proposed_actions=[ProposedAction(action="runPrintCheck", params={}, reversible=True)],
        )

    if any(word in text for word in ("rotate", "turn", "spin", "view it")):
        return AssistantReply(
            reply="Rotating the view for you.",
            proposed_actions=[
                ProposedAction(action="rotateView", params={"axis": "y", "degrees": 45}, reversible=True)
            ],
        )

    if any(word in text for word in ("not detected", "wrong size", "no reference", "recalibrate", "coin", "card")):
        ref_type = "coin" if "coin" in text else "card"
        return AssistantReply(
            reply=f"For accurate millimeters, place a {ref_type} flat in the same photo as the object and rescan — that gives me a real-world scale to calibrate against.",
            proposed_actions=[
                ProposedAction(action="addReferenceHint", params={"reference_type": ref_type}, reversible=True)
            ],
        )

    if any(
        word in text
        for word in ("bigger", "smaller", "resize", "make it", "fit", "size", "width", "height", "depth")
    ):
        target = _NUMBER_MM.search(text)
        if not target:
            return AssistantReply(
                reply="Sure — what target size did you have in mind? For example, \"make the width 120mm\" or \"resize to fit a 32mm pipe.\"",
                proposed_actions=[],
            )
        if not current:
            return AssistantReply(
                reply="I don't have a measured scan to resize yet — upload and scan an object first, then I can adjust it.",
                proposed_actions=[],
            )
        target_mm = float(target.group(1))
        ratio = target_mm / current["width_mm"] if current["width_mm"] else 1
        return AssistantReply(
            reply=f"Scaling proportionally so the width lands at {target_mm:.0f}mm, keeping the aspect ratio locked.",
            proposed_actions=[
                ProposedAction(
                    action="setDimensions",
                    params={
                        "width_mm": round(target_mm, 1),
                        "height_mm": round(current["height_mm"] * ratio, 1),
                        "depth_mm": round(current["depth_mm"] * ratio, 1),
                    },
                    reversible=True,
                )
            ],
        )

    return AssistantReply(
        reply=(
            "I can resize the model to a target measurement, check it against print heuristics, "
            "rotate the view, or export it — just tell me what you're trying to do."
        ),
        proposed_actions=[],
    )


def _real_reply(message: str, events: list[TulasiEvent]) -> AssistantReply:
    import anthropic

    client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    context = "\n".join(f"- {e.type}: {e.payload}" for e in events[-10:]) or "No recent activity."

    response = client.messages.create(
        model=MODEL,
        max_tokens=1024,
        system=(
            "You are Tulasi's in-app copilot. You help the user resize a scanned 3D object to "
            "real-world millimeter measurements, check printability, rotate the view, and export. "
            "You can only act through the provided tools — never claim to have done something you "
            "didn't call a tool for. Ask a clarifying question if the request is ambiguous (e.g. no "
            "target size given) instead of guessing."
        ),
        tools=TOOLS,
        messages=[{"role": "user", "content": f"Recent session context:\n{context}\n\nUser: {message}"}],
    )

    reply_text = "".join(block.text for block in response.content if block.type == "text")
    proposed_actions = [
        ProposedAction(action=block.name, params=block.input, reversible=REVERSIBLE.get(block.name, False))
        for block in response.content
        if block.type == "tool_use"
    ]
    return AssistantReply(reply=reply_text, proposed_actions=proposed_actions)


def get_reply(message: str, events: list[TulasiEvent]) -> AssistantReply:
    if _mock_enabled():
        return _mock_reply(message, events)
    return _real_reply(message, events)

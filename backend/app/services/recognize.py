"""Object recognition: identify the distinct physical object(s) in an uploaded
photo so the user can confirm what to model before we spend Meshy credits.

Real mode calls Claude vision. Mock mode (the default — the Anthropic key has
$0 credit) does NOT invent a label: without a vision model we honestly can't
name the object, only guess *where* it is, so we fall back to the OpenCV
subject box with a null label. Never fake data.
"""

import base64
import json
import os

from ..models.schemas import RecognizedObject, RecognizeResponse, SubjectBox
from . import subject

MODEL = "claude-sonnet-5"


def _mock_enabled() -> bool:
    return os.environ.get("MOCK_RECOGNIZE", "1") == "1"


def recognize(image_bytes: bytes, content_type: str) -> RecognizeResponse:
    if _mock_enabled():
        return _guess_from_opencv(image_bytes)
    try:
        return _real(image_bytes, content_type)
    except Exception:
        # Never block the scan flow — degrade to the OpenCV single-box guess.
        return _guess_from_opencv(image_bytes)


def _guess_from_opencv(image_bytes: bytes) -> RecognizeResponse:
    box = SubjectBox(**subject.suggest_box(image_bytes))
    return RecognizeResponse(
        objects=[
            RecognizedObject(
                label=None,
                description=None,
                box=box,
                confidence=0.7 if box.confident else 0.35,
            )
        ]
    )


def _extract_json(text: str) -> str:
    start = text.find("{")
    end = text.rfind("}")
    return text[start : end + 1] if start != -1 and end != -1 else "{}"


def _real(image_bytes: bytes, content_type: str) -> RecognizeResponse:
    import anthropic

    client = anthropic.Anthropic(api_key=os.environ["ANTHROPIC_API_KEY"])
    media_type = "image/png" if "png" in (content_type or "") else "image/jpeg"
    encoded = base64.b64encode(image_bytes).decode()
    prompt = (
        "Identify each distinct physical object in this photo that a user might want turned into a 3D "
        "model. Ignore hands, background, and the surface it sits on. Respond with ONLY JSON of the form "
        '{"objects":[{"label":"short name","description":"one phrase","box":{"x":0..1,"y":0..1,"w":0..1,'
        '"h":0..1},"confidence":0..1}]} where box is the object\'s bounding box as fractions of the image '
        "width/height. If you are unsure, return a low confidence."
    )

    response = client.messages.create(
        model=MODEL,
        max_tokens=1024,
        messages=[
            {
                "role": "user",
                "content": [
                    {"type": "image", "source": {"type": "base64", "media_type": media_type, "data": encoded}},
                    {"type": "text", "text": prompt},
                ],
            }
        ],
    )

    text = "".join(block.text for block in response.content if block.type == "text")
    data = json.loads(_extract_json(text))

    objects: list[RecognizedObject] = []
    for item in data.get("objects", []):
        raw = item.get("box") or {}
        confidence = float(item.get("confidence", 0.5))
        box = SubjectBox(
            x=float(raw.get("x", 0.2)),
            y=float(raw.get("y", 0.2)),
            w=float(raw.get("w", 0.6)),
            h=float(raw.get("h", 0.6)),
            confident=confidence > 0.6,
        )
        objects.append(
            RecognizedObject(
                label=item.get("label"),
                description=item.get("description"),
                box=box,
                confidence=confidence,
            )
        )

    if not objects:
        return _guess_from_opencv(image_bytes)
    return RecognizeResponse(objects=objects)

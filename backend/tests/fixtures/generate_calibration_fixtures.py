"""Regenerates the synthetic calibration test fixtures.

These are drawn shapes with known pixel dimensions standing in for a real
photo of an object next to a credit card, since no real ruler-measured photos
exist yet. They validate the calibration math, not real-world robustness
(lighting, perspective, camera noise) — see .claude/skills/opencv-calibration
for what real fixtures would add on top of this.
"""

import json
from pathlib import Path

import cv2
import numpy as np

FIXTURES_DIR = Path(__file__).parent
CARD_WIDTH_MM = 85.60


def _make_canvas(size: tuple[int, int] = (600, 400)) -> np.ndarray:
    return np.full((size[1], size[0], 3), 220, dtype=np.uint8)


def make_card_and_object_fixture() -> None:
    image = _make_canvas()

    # Card: 300x189px ~ 1.587 aspect ratio, standing in for an 85.60x53.98mm card.
    card_box = (30, 30, 300, 189)
    cx, cy, cw, ch = card_box
    cv2.rectangle(image, (cx, cy), (cx + cw, cy + ch), (40, 40, 40), thickness=-1)

    # Object: some other rectangle elsewhere in frame, distinct color.
    object_box = (380, 150, 160, 90)
    ox, oy, ow, oh = object_box
    cv2.rectangle(image, (ox, oy), (ox + ow, oy + oh), (60, 120, 200), thickness=-1)

    cv2.imwrite(str(FIXTURES_DIR / "card_and_object.png"), image)

    mm_per_px = CARD_WIDTH_MM / cw
    truth = {
        "width_mm": ow * mm_per_px,
        "height_mm": oh * mm_per_px,
    }
    (FIXTURES_DIR / "card_and_object.truth.json").write_text(json.dumps(truth, indent=2))


def make_no_reference_fixture() -> None:
    image = _make_canvas()

    # A square (not card-shaped) — no valid reference object anywhere in frame.
    box = (200, 130, 140, 140)
    x, y, w, h = box
    cv2.rectangle(image, (x, y), (x + w, y + h), (60, 120, 200), thickness=-1)

    cv2.imwrite(str(FIXTURES_DIR / "no_reference.png"), image)


def main() -> None:
    make_card_and_object_fixture()
    make_no_reference_fixture()
    print(f"wrote fixtures to {FIXTURES_DIR}")


if __name__ == "__main__":
    main()

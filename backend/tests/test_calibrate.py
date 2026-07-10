"""Test-first calibration coverage using synthetically drawn scenes (known
reference + object pixel sizes -> exact ground truth), since we don't have
ruler-measured real photos yet. Tolerances match the spec: 5% flat-on, 8%
angled. Real fixture photos should replace/augment these before shipping.
"""

import cv2
import numpy as np
import pytest

from app.services import calibrate

CARD_REAL_W_MM = 85.60
CARD_REAL_H_MM = 53.98
COIN_REAL_DIAMETER_MM = 24.26


def _encode_png(image: np.ndarray) -> bytes:
    ok, buf = cv2.imencode(".png", image)
    assert ok
    return buf.tobytes()


def _blank_canvas(w: int = 800, h: int = 600) -> np.ndarray:
    return np.full((h, w, 3), 40, dtype=np.uint8)


def _draw_rect(canvas: np.ndarray, center, size, color, angle: float = 0) -> None:
    box = cv2.boxPoints((center, size, angle)).astype(np.int32)
    cv2.fillPoly(canvas, [box], color)


def test_card_flat_measures_object_within_5_percent():
    canvas = _blank_canvas()
    card_px = (300, 189)  # ratio ~1.587, within ISO card tolerance
    mm_per_px = CARD_REAL_W_MM / card_px[0]
    _draw_rect(canvas, center=(170, 480), size=card_px, color=(255, 255, 255))

    object_px = (420, 280)
    _draw_rect(canvas, center=(560, 260), size=object_px, color=(120, 160, 200))

    result = calibrate.measure(_encode_png(canvas))

    assert result.reference_type.value == "card"
    assert result.reference_confidence >= 0.6
    assert result.width_mm == pytest.approx(object_px[0] * mm_per_px, rel=0.05)
    assert result.height_mm == pytest.approx(object_px[1] * mm_per_px, rel=0.05)


def test_card_angled_measures_object_within_8_percent():
    canvas = _blank_canvas()
    card_px = (300, 189)
    mm_per_px = CARD_REAL_W_MM / card_px[0]
    _draw_rect(canvas, center=(220, 460), size=card_px, color=(255, 255, 255), angle=18)

    object_px = (380, 260)
    _draw_rect(canvas, center=(560, 250), size=object_px, color=(120, 160, 200), angle=12)

    result = calibrate.measure(_encode_png(canvas))

    assert result.reference_type.value == "card"
    assert result.width_mm == pytest.approx(object_px[0] * mm_per_px, rel=0.08)
    assert result.height_mm == pytest.approx(object_px[1] * mm_per_px, rel=0.08)


def test_coin_fallback_when_no_card_present():
    canvas = _blank_canvas()
    radius_px = 60
    mm_per_px = COIN_REAL_DIAMETER_MM / (2 * radius_px)
    cv2.circle(canvas, (150, 480), radius_px, (255, 255, 255), -1)

    # Square object — aspect ratio 1.0 is well outside the card tolerance
    # band, so it can't be mistaken for a card reference.
    object_px = (300, 200)
    _draw_rect(canvas, center=(560, 260), size=object_px, color=(120, 160, 200))

    result = calibrate.measure(_encode_png(canvas))

    assert result.reference_type.value == "coin"
    assert result.width_mm == pytest.approx(object_px[0] * mm_per_px, rel=0.08)
    assert result.height_mm == pytest.approx(object_px[1] * mm_per_px, rel=0.08)


def test_no_reference_returns_none_type_and_null_dimensions():
    canvas = _blank_canvas()
    # Square object only — no card-ratio quad, no circle.
    _draw_rect(canvas, center=(400, 300), size=(250, 250), color=(120, 160, 200))

    result = calibrate.measure(_encode_png(canvas))

    assert result.reference_type.value == "none"
    assert result.reference_confidence == 0.0
    assert result.width_mm is None
    assert result.height_mm is None
    assert result.depth_mm is None
    assert result.depth_estimated is True


def test_depth_is_always_estimated_as_ratio_of_smaller_dimension():
    canvas = _blank_canvas()
    card_px = (300, 189)
    _draw_rect(canvas, center=(170, 480), size=card_px, color=(255, 255, 255))
    _draw_rect(canvas, center=(560, 260), size=(420, 280), color=(120, 160, 200))

    result = calibrate.measure(_encode_png(canvas))

    assert result.depth_estimated is True
    assert result.depth_mm == pytest.approx(min(result.width_mm, result.height_mm) * 0.8, rel=0.01)


def test_unreadable_image_raises_value_error():
    with pytest.raises(ValueError):
        calibrate.measure(b"not an image")

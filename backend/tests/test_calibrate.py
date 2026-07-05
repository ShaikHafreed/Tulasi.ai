import json
from pathlib import Path

import pytest

from app.services import calibrate

FIXTURES_DIR = Path(__file__).parent / "fixtures"
FLAT_ON_TOLERANCE = 0.05


def test_calibrate_recovers_dimensions_within_tolerance():
    image_bytes = (FIXTURES_DIR / "card_and_object.png").read_bytes()
    truth = json.loads((FIXTURES_DIR / "card_and_object.truth.json").read_text())

    result = calibrate.calibrate(image_bytes)

    assert result["reference_detected"] is True
    assert result["reference_type"] == "card"
    assert result["confidence"] >= calibrate.CARD_MIN_CONFIDENCE

    # minAreaRect doesn't guarantee which in-plane side is "width" vs "height",
    # so compare the *set* of measured dimensions against the set of truth
    # dimensions rather than assuming a fixed axis mapping.
    measured = sorted([result["width_mm"], result["height_mm"]])
    expected = sorted([truth["width_mm"], truth["height_mm"]])

    for measured_value, expected_value in zip(measured, expected):
        assert measured_value == pytest.approx(expected_value, rel=FLAT_ON_TOLERANCE)

    assert result["depth_estimated"] is True
    assert result["depth_mm"] == pytest.approx(min(measured) * 0.8, rel=FLAT_ON_TOLERANCE)


def test_calibrate_reports_no_reference_detected():
    image_bytes = (FIXTURES_DIR / "no_reference.png").read_bytes()

    result = calibrate.calibrate(image_bytes)

    assert result["reference_detected"] is False
    assert result["width_mm"] is None
    assert result["height_mm"] is None
    assert result["depth_mm"] is None

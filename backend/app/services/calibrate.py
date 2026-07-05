"""Reference-object calibration: card/coin detection and object measurement.

See .claude/skills/opencv-calibration/SKILL.md for the recipe this follows.
"""

import cv2
import numpy as np

CARD_WIDTH_MM = 85.60
CARD_ASPECT_RATIO = 85.60 / 53.98  # ~1.586
CARD_ASPECT_TOLERANCE = 0.12
CARD_MIN_CONFIDENCE = 0.6

COIN_DIAMETER_MM = 27.0
COIN_CONFIDENCE = 0.75

DEPTH_ESTIMATE_FACTOR = 0.8
MIN_CONTOUR_AREA = 500.0


class ReferenceMatch:
    def __init__(self, kind: str, mm_per_px: float, confidence: float, contour) -> None:
        self.kind = kind
        self.mm_per_px = mm_per_px
        self.confidence = confidence
        self.contour = contour


def _decode(image_bytes: bytes) -> np.ndarray:
    array = np.frombuffer(image_bytes, dtype=np.uint8)
    image = cv2.imdecode(array, cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("Could not decode image")
    return image


def _find_contours(image: np.ndarray) -> list:
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(blurred, 50, 150)
    edges = cv2.dilate(edges, None, iterations=1)
    contours, _ = cv2.findContours(edges, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)
    return [c for c in contours if cv2.contourArea(c) >= MIN_CONTOUR_AREA]


def _detect_card(contours: list) -> ReferenceMatch | None:
    best: ReferenceMatch | None = None
    for contour in contours:
        perimeter = cv2.arcLength(contour, True)
        approx = cv2.approxPolyDP(contour, 0.02 * perimeter, True)
        if len(approx) != 4:
            continue

        (_, _), (w, h), _ = cv2.minAreaRect(contour)
        if w == 0 or h == 0:
            continue

        long_side, short_side = max(w, h), min(w, h)
        aspect = long_side / short_side
        deviation = abs(aspect - CARD_ASPECT_RATIO)
        if deviation > CARD_ASPECT_TOLERANCE:
            continue

        confidence = max(0.0, 1.0 - deviation / CARD_ASPECT_TOLERANCE)
        if best is None or confidence > best.confidence:
            best = ReferenceMatch("card", CARD_WIDTH_MM / long_side, confidence, contour)

    if best is not None and best.confidence >= CARD_MIN_CONFIDENCE:
        return best
    return None


def _detect_coin(image: np.ndarray) -> ReferenceMatch | None:
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    blurred = cv2.medianBlur(gray, 5)
    circles = cv2.HoughCircles(
        blurred,
        cv2.HOUGH_GRADIENT,
        dp=1.2,
        minDist=max(blurred.shape[0] // 4, 1),
        param1=100,
        param2=40,
        minRadius=10,
        maxRadius=min(blurred.shape) // 3,
    )
    if circles is None:
        return None

    _, _, radius = circles[0][0]
    return ReferenceMatch("coin", COIN_DIAMETER_MM / (radius * 2), COIN_CONFIDENCE, None)


def _largest_object_contour(contours: list, reference_contour):
    reference_area = cv2.contourArea(reference_contour) if reference_contour is not None else 0
    best = None
    best_area = 0.0
    for contour in contours:
        area = cv2.contourArea(contour)
        if reference_area and abs(area - reference_area) < reference_area * 0.2:
            continue
        if area > best_area:
            best_area = area
            best = contour
    return best


def calibrate(image_bytes: bytes) -> dict:
    image = _decode(image_bytes)
    contours = _find_contours(image)

    reference = _detect_card(contours) or _detect_coin(image)

    if reference is None:
        return {
            "reference_detected": False,
            "reference_type": None,
            "confidence": None,
            "width_mm": None,
            "height_mm": None,
            "depth_mm": None,
            "depth_estimated": False,
        }

    object_contour = _largest_object_contour(contours, reference.contour)
    if object_contour is None:
        return {
            "reference_detected": True,
            "reference_type": reference.kind,
            "confidence": reference.confidence,
            "width_mm": None,
            "height_mm": None,
            "depth_mm": None,
            "depth_estimated": False,
        }

    (_, _), (w_px, h_px), _ = cv2.minAreaRect(object_contour)
    width_mm = w_px * reference.mm_per_px
    height_mm = h_px * reference.mm_per_px
    depth_mm = min(width_mm, height_mm) * DEPTH_ESTIMATE_FACTOR

    return {
        "reference_detected": True,
        "reference_type": reference.kind,
        "confidence": reference.confidence,
        "width_mm": width_mm,
        "height_mm": height_mm,
        "depth_mm": depth_mm,
        "depth_estimated": True,
    }

"""Reference-object calibration: find a credit card or coin in the photo,
use its known real-world size to derive mm-per-pixel, then measure the
largest remaining object against that scale.

Depth can never be read from a single 2D photo, so it's always a rough
estimate (min(w, h) * 0.8) and always flagged `depth_estimated=True`,
independent of whether a reference was found.
"""

from dataclasses import dataclass

import cv2
import numpy as np

from ..models.schemas import MeasurementResult, ReferenceType

CARD_WIDTH_MM = 85.60
CARD_HEIGHT_MM = 53.98
CARD_ASPECT_RATIO = CARD_WIDTH_MM / CARD_HEIGHT_MM
CARD_ASPECT_TOLERANCE = 0.12
CARD_CONFIDENCE_THRESHOLD = 0.6

# Coin fallback only recognizes one denomination for now — a US quarter.
# Confidence is a fixed heuristic since HoughCircles doesn't score matches.
COIN_DIAMETER_MM = 24.26
COIN_CONFIDENCE = 0.75

# Real cards/coins are visually flat (a plain printed face or a metal disc).
# A geometrically circle/quad-shaped real-world object with a visually busy
# interior — a car wheel with spokes, a headlight ring, a window — is not
# one. This is a coarse "is this obviously too busy" gate, not a fine-grained
# quality score — real cards have mild print texture too, so the bar is set
# well above that, only catching clearly non-flat objects.
MAX_INTERIOR_STD = 55.0

MIN_CONTOUR_AREA_FRACTION = 0.001
DEPTH_RATIO = 0.8

# Tulasi measures small printable objects (mugs, brackets, hinges), not
# vehicles or furniture. A "successful" measurement outside this range means
# the reference was almost certainly misidentified — better to say "not
# detected" than hand back confident nonsense.
MIN_PLAUSIBLE_OBJECT_MM = 5.0
MAX_PLAUSIBLE_OBJECT_MM = 1000.0


@dataclass
class Reference:
    type: ReferenceType
    confidence: float
    mm_per_px: float | None
    contour: np.ndarray | None


def _decode_image(image_bytes: bytes) -> np.ndarray:
    array = np.frombuffer(image_bytes, dtype=np.uint8)
    image = cv2.imdecode(array, cv2.IMREAD_COLOR)
    if image is None:
        raise ValueError("Could not decode image")
    return image


def _find_contours(gray: np.ndarray) -> list[np.ndarray]:
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(blurred, 50, 150)
    edges = cv2.dilate(edges, None, iterations=2)
    contours, _ = cv2.findContours(edges, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)

    frame_area = gray.shape[0] * gray.shape[1]
    min_area = frame_area * MIN_CONTOUR_AREA_FRACTION
    return [c for c in contours if cv2.contourArea(c) >= min_area]


def _is_flat_enough(gray: np.ndarray, mask: np.ndarray) -> bool:
    if cv2.countNonZero(mask) == 0:
        return False
    _, std_dev = cv2.meanStdDev(gray, mask=mask)
    return float(std_dev[0][0]) <= MAX_INTERIOR_STD


def _contour_mask(gray: np.ndarray, contour: np.ndarray) -> np.ndarray:
    mask = np.zeros(gray.shape, dtype=np.uint8)
    cv2.fillPoly(mask, [contour], 255)
    return mask


def _detect_card(gray: np.ndarray, contours: list[np.ndarray]) -> Reference | None:
    best: Reference | None = None

    for contour in contours:
        perimeter = cv2.arcLength(contour, True)
        approx = cv2.approxPolyDP(contour, 0.02 * perimeter, True)
        if len(approx) != 4 or not cv2.isContourConvex(approx):
            continue

        (_, _), (w, h), _ = cv2.minAreaRect(contour)
        if w == 0 or h == 0:
            continue

        long_side, short_side = max(w, h), min(w, h)
        ratio = long_side / short_side
        ratio_error = abs(ratio - CARD_ASPECT_RATIO)
        if ratio_error > CARD_ASPECT_TOLERANCE:
            continue

        if not _is_flat_enough(gray, _contour_mask(gray, contour)):
            continue

        rect_area = w * h
        fill_ratio = min(1.0, cv2.contourArea(contour) / rect_area) if rect_area else 0.0
        confidence = max(0.0, 1 - ratio_error / CARD_ASPECT_TOLERANCE) * fill_ratio

        if best is None or confidence > best.confidence:
            mm_per_px = ((CARD_WIDTH_MM / long_side) + (CARD_HEIGHT_MM / short_side)) / 2
            best = Reference(
                type=ReferenceType.CARD,
                confidence=confidence,
                mm_per_px=mm_per_px,
                contour=contour,
            )

    return best


def _detect_coin(gray: np.ndarray) -> Reference | None:
    blurred = cv2.medianBlur(gray, 5)
    h, w = gray.shape

    circles = cv2.HoughCircles(
        blurred,
        cv2.HOUGH_GRADIENT,
        dp=1.2,
        minDist=min(h, w) / 4,
        param1=100,
        param2=25,
        minRadius=int(min(h, w) * 0.02),
        maxRadius=int(min(h, w) * 0.25),
    )
    if circles is None:
        return None

    for x, y, radius in circles[0]:
        if radius <= 0:
            continue

        mask = np.zeros(gray.shape, dtype=np.uint8)
        cv2.circle(mask, (int(x), int(y)), int(radius), 255, -1)
        if not _is_flat_enough(gray, mask):
            continue

        mm_per_px = COIN_DIAMETER_MM / (2 * radius)
        contour = cv2.ellipse2Poly((int(x), int(y)), (int(radius), int(radius)), 0, 0, 360, 10)
        return Reference(
            type=ReferenceType.COIN,
            confidence=COIN_CONFIDENCE,
            mm_per_px=mm_per_px,
            contour=contour.reshape(-1, 1, 2),
        )

    return None


def _detect_reference(gray: np.ndarray, contours: list[np.ndarray]) -> Reference | None:
    card = _detect_card(gray, contours)
    if card is not None and card.confidence >= CARD_CONFIDENCE_THRESHOLD:
        return card
    return _detect_coin(gray)


def _bounding_box(contour: np.ndarray) -> tuple[int, int, int, int]:
    x, y, w, h = cv2.boundingRect(contour)
    return x, y, x + w, y + h


def _iou(box_a: tuple[int, int, int, int], box_b: tuple[int, int, int, int]) -> float:
    ax1, ay1, ax2, ay2 = box_a
    bx1, by1, bx2, by2 = box_b
    inter_w = max(0, min(ax2, bx2) - max(ax1, bx1))
    inter_h = max(0, min(ay2, by2) - max(ay1, by1))
    inter = inter_w * inter_h
    if inter == 0:
        return 0.0
    area_a = (ax2 - ax1) * (ay2 - ay1)
    area_b = (bx2 - bx1) * (by2 - by1)
    return inter / (area_a + area_b - inter)


def _largest_object_contour(
    contours: list[np.ndarray], reference: Reference | None
) -> np.ndarray | None:
    candidates = contours
    if reference is not None and reference.contour is not None:
        # The coin reference's contour is a synthesized ellipse approximation,
        # not one of `contours` itself, so identity/area matching can't
        # reliably exclude it — use bounding-box overlap instead.
        ref_box = _bounding_box(reference.contour)
        candidates = [c for c in contours if _iou(_bounding_box(c), ref_box) < 0.5]

    if not candidates:
        return None
    return max(candidates, key=cv2.contourArea)


def _no_reference_result() -> MeasurementResult:
    return MeasurementResult(
        width_mm=None,
        height_mm=None,
        depth_mm=None,
        depth_estimated=True,
        reference_type=ReferenceType.NONE,
        reference_confidence=0.0,
    )


def measure(image_bytes: bytes) -> MeasurementResult:
    image = _decode_image(image_bytes)
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    contours = _find_contours(gray)
    reference = _detect_reference(gray, contours)

    if reference is None:
        return _no_reference_result()

    object_contour = _largest_object_contour(contours, reference)
    if object_contour is None:
        return MeasurementResult(
            width_mm=None,
            height_mm=None,
            depth_mm=None,
            depth_estimated=True,
            reference_type=reference.type,
            reference_confidence=round(reference.confidence, 2),
        )

    # minAreaRect's (w, h) order depends on its internal angle convention,
    # not the object's actual orientation — normalize to long-side-first so
    # width_mm/height_mm are deterministic regardless of rotation in the photo.
    (_, _), (raw_w, raw_h), _ = cv2.minAreaRect(object_contour)
    long_px, short_px = max(raw_w, raw_h), min(raw_w, raw_h)
    width_mm = long_px * reference.mm_per_px
    height_mm = short_px * reference.mm_per_px

    # A "successful" reading outside Tulasi's actual domain (small printable
    # objects) means the reference was almost certainly something else
    # entirely (a wheel, a window) — report honestly instead of guessing.
    if not (MIN_PLAUSIBLE_OBJECT_MM <= width_mm <= MAX_PLAUSIBLE_OBJECT_MM) or not (
        MIN_PLAUSIBLE_OBJECT_MM <= height_mm <= MAX_PLAUSIBLE_OBJECT_MM
    ):
        return _no_reference_result()

    depth_mm = min(width_mm, height_mm) * DEPTH_RATIO

    return MeasurementResult(
        width_mm=round(width_mm, 1),
        height_mm=round(height_mm, 1),
        depth_mm=round(depth_mm, 1),
        depth_estimated=True,
        reference_type=reference.type,
        reference_confidence=round(reference.confidence, 2),
    )

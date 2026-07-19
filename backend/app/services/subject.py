"""Subject suggestion: given an uploaded photo, guess a bounding box around
the main object so the user can confirm "model THIS, not my hand / the
background" before we send anything to Meshy.

This is a lightweight OpenCV heuristic, not a named-object detector — it finds
the most prominent foreground blob and returns its box as a *suggestion* the
user then adjusts. When it isn't confident it falls back to a centred box.
"""

import cv2
import numpy as np

# Reject boxes that are basically the whole frame (nothing isolated) or tiny
# specks of noise.
_MIN_AREA_FRACTION = 0.03
_MAX_AREA_FRACTION = 0.9
_PAD_FRACTION = 0.04


def _centered_default() -> dict:
    return {"x": 0.2, "y": 0.2, "w": 0.6, "h": 0.6, "confident": False}


def suggest_box(image_bytes: bytes) -> dict:
    """Returns a normalised box {x, y, w, h in 0..1, confident: bool}."""
    array = np.frombuffer(image_bytes, np.uint8)
    img = cv2.imdecode(array, cv2.IMREAD_COLOR)
    if img is None:
        return _centered_default()

    height, width = img.shape[:2]
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    blur = cv2.GaussianBlur(gray, (5, 5), 0)

    # Otsu splits fore/background; if the frame corners are the "white" side,
    # the object is the dark side, so invert to make the object foreground.
    _, thresh = cv2.threshold(blur, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    corners = [thresh[0, 0], thresh[0, -1], thresh[-1, 0], thresh[-1, -1]]
    if float(np.mean(corners)) > 127:
        thresh = cv2.bitwise_not(thresh)

    kernel = np.ones((5, 5), np.uint8)
    thresh = cv2.morphologyEx(thresh, cv2.MORPH_OPEN, kernel, iterations=2)
    thresh = cv2.morphologyEx(thresh, cv2.MORPH_CLOSE, np.ones((15, 15), np.uint8), iterations=2)

    contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    frame_area = float(width * height)
    best = None
    best_area = 0.0
    for contour in contours:
        x, y, box_w, box_h = cv2.boundingRect(contour)
        area = float(box_w * box_h)
        fraction = area / frame_area
        if _MIN_AREA_FRACTION < fraction < _MAX_AREA_FRACTION and area > best_area:
            best = (x, y, box_w, box_h)
            best_area = area

    if best is None:
        return _centered_default()

    x, y, box_w, box_h = best
    pad_x = int(_PAD_FRACTION * width)
    pad_y = int(_PAD_FRACTION * height)
    x0 = max(0, x - pad_x)
    y0 = max(0, y - pad_y)
    x1 = min(width, x + box_w + pad_x)
    y1 = min(height, y + box_h + pad_y)

    return {
        "x": x0 / width,
        "y": y0 / height,
        "w": (x1 - x0) / width,
        "h": (y1 - y0) / height,
        "confident": True,
    }

---
name: opencv-calibration
description: Phase 2 reference material for backend/app/services/calibrate.py — reference-object detection (credit card / coin) and real-world dimension estimation via OpenCV. Use when implementing or reviewing calibration/measurement code, not needed for Phase 1.
---

# OpenCV calibration recipes (Phase 2)

Not used in Phase 1. This is reference material for when `calibrate.py` gets
implemented — reproduced here so the recipe doesn't have to be re-derived.

## Reference objects

- **Credit card** (ISO 7810 ID-1): 85.60mm × 53.98mm, aspect ratio 1.586.
- **₹10 coin**: 27mm diameter.

## Card detection

1. Find contours in the preprocessed image.
2. Approximate each with `cv2.approxPolyDP` looking for a 4-point quadrilateral.
3. Accept a candidate only if its aspect ratio is `1.586 ± 0.12`.
4. Score a confidence value; if confidence `< 0.6`, report "not detected"
   rather than guessing — a wrong calibration is worse than none.
5. Once accepted, compute `mm_per_px = 85.60 / card_width_px`.

## Coin detection

- Use `cv2.HoughCircles` to find circular candidates.
- Known diameter (27mm) over detected pixel diameter gives `mm_per_px`.

## Object dimensions

- Bounding dimensions via `cv2.minAreaRect` on the object's contour, converted
  to mm using `mm_per_px`.
- Depth cannot be measured from a single flat photo. Estimate
  `depth = min(width, height) * 0.8` and flag the result
  `"depth_estimated"` so the UI can show the amber "estimated" badge rather
  than presenting a guess as measured fact.

## Testing discipline

`calibrate.py` is test-first: write tests against fixture photos with a
`truth.json` of known-correct dimensions *before* writing detection logic.
Tolerances: **5%** for flat-on shots, **8%** for angled shots. When a test
fails, tune the detection constants — never loosen the assertion to make it
pass.

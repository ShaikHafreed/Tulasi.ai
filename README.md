# Tulasi.ai

**Meshy makes it look right. Tulasi makes it FIT right.**

Tulasi converts a photo of a physical object into an editable 3D model with
real-world measurements. Photograph an object next to a coin or credit card,
and Tulasi calibrates against it to hand back a model sized to the
millimeter — not a guess dressed up in a nice render.

Mesh-generation quality is already commoditized (Meshy, Tripo, Rodin). The
differentiator here is dimensional accuracy via reference-object
calibration.

## What's built

- **Real photo → 3D pipeline**: upload a photo, Meshy generates a real 3D
  model, served back through the app's own storage.
- **Reference-object calibration**: detects a credit card or coin in the
  photo (contour/aspect-ratio matching for cards, Hough-circle detection for
  coins), derives millimeters-per-pixel, and measures the object against it.
  Guards against false positives (a car wheel or headlight ring won't get
  mistaken for a coin) and against physically implausible results.
- **Dimension panel**: editable width/height/depth in mm, aspect-lock
  toggle, honest "estimated" badge when no reference was found.
- **3D viewer**: solid or wireframe/mesh view, live rescaling as you edit
  dimensions.
- **Tulasi AI copilot**: an in-app chat panel that resizes the model to a
  target measurement, runs a basic print-readiness check, rotates the view,
  or exports the file — asks a clarifying question when your request is
  ambiguous instead of guessing.
- **Browser extension**: a Manifest V3 side panel that controls the same
  copilot from outside the tab, scoped strictly to the Tulasi app.
- Real auth (email/password + Google + GitHub OAuth) via Supabase, with a
  library of your past scans.

## Stack

React 19 + Vite + TypeScript + Tailwind CSS v4 + shadcn/ui on the frontend;
FastAPI + OpenCV + the Meshy API on the backend; Supabase for auth and
storage.

## Status

Solo build, in public. Actively shipping — see `CLAUDE.md` for the detailed
build log and roadmap.

## Build log

- **Day 1–2**: Landing page, real auth (email/password + Google + GitHub
  OAuth via Supabase), dashboard shell, and the first working photo → 3D
  scan flow (mock-mode generation to build the UI without burning credits).
- **Day 3**: Fixed a calibration false-positive (a car wheel was getting
  mistaken for a coin reference and returning bogus millimeter readings) —
  added a flatness check and a physical-plausibility guard. Switched on
  real Meshy 3D generation end-to-end. Shipped the Tulasi AI copilot chat
  panel (resize to a target measurement, print-readiness check, rotate,
  export — asks clarifying questions instead of guessing). Built a Chrome
  extension side panel that drives the same copilot from outside the tab.
  Added a solid/wireframe view toggle to the 3D viewer.
- **Day 15**: Repainted the whole app from dark navy/teal to a warm ivory/
  terracotta palette via design tokens alone — zero component rewrites.
  Caught and fixed a real bug while doing it: the landing-page mug handle
  was rendering through the inside of the cup because of a flipped rotation
  sign, verified the fix by actually running the 3D vertex math instead of
  eyeballing it. Replaced pinch-based gesture control with finger counting
  (1 finger = move, 2 = grow, 3 = shrink, open palm = rotate) on both the
  webcam and the glove firmware. Then ran a real bug-fix pass driven by
  actual usage: delete silently breaking after one use, a "Present" button
  doing nothing with zero feedback, a gesture dropdown that could render
  clipped — all root-caused and fixed, not guessed at. Also deleted a
  fake "print-ready mesh validation" stub that promised wall-thickness and
  overhang checks it never actually ran.
- **Day 16**: STL exports are now slicer-ready — rotated into the print-bed
  orientation and dropped flat-base-down, verified with real mesh math, not
  eyeballed. Added a print cost/weight estimator using the model's actual
  volume (not a bounding-box guess) times material density. Did a mobile
  pass on the scan flow, including a real fix: the crop tool's resize
  handle was 16px, way too small to grab with a finger, now a proper touch
  target. Then found and fixed a real accessibility bug in yesterday's
  palette: the terracotta and sage text colors failed WCAG contrast
  (3.36:1 and 2.85:1 against a 4.5:1 minimum) — checked with the actual
  contrast formula, not a guess, and corrected at the token source so every
  screen picked it up at once. Shipped a real mobile bottom nav and
  restyled the command palette and onboarding checklist to match.

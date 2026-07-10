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

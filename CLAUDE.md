# Tulasi — AI-native 3D design (Tulasi.ai)

Solo-founder project (Hafreed). Converts a photo of any physical object into an
accurate, editable 3D model with real-world measurements. No 3D modeling skill
required by the end user.

Positioning: "Meshy makes it look right. Tulasi makes it FIT right."
Competitors (Meshy, Tripo, Rodin, Backflip) commoditize mesh generation. Our
moat is dimensional accuracy + parametric editing + AI assistance, not
generation quality.

## Signature features (across all phases)

1. **Reference-object calibration** — photograph the object next to a credit
   card (ISO 7810: 85.60 × 53.98 mm) or ₹10 coin (27 mm); OpenCV detects it,
   computes mm-per-pixel, all dimensions become real-world accurate.
2. **Smart dimension lock** — resizing one dimension preserves functional
   constraints, not dumb uniform scaling.
3. **Print-ready validation** — wall thickness (≥1.2mm FDM), overhangs (>45°
   flagged), stability; plain-language report.
4. **Object library** — every scan saved with real dimensions.
5. **Context-aware AI assistant** — Claude API tool-use acting on the model
   ("make this bracket fit a 32mm pipe").

## Out of scope — never build, even if asked casually

Haptic gloves/hardware, holograms, custom AI training, native mobile apps,
realtime collaboration.

## Stack

- Backend: Python 3.11+, FastAPI (async, typed, pydantic everywhere)
- Mesh generation: Meshy image-to-3D API (never build our own model)
- Measurement: OpenCV; Parametric: CadQuery/trimesh
- Frontend: React 18 + Vite + TypeScript (strict) + Tailwind + shadcn/ui, dark theme
- 3D viewer: Three.js + @react-three/fiber + drei
- Gestures (Phase 3): MediaPipe Hands (browser)
- Assistant (Phase 4): Claude API tool use
- DB/auth (Phase 5): Supabase; Hosting: Vercel + Railway/Render

## Repo structure

```
Tulasi.ai/
├── CLAUDE.md
├── .claude/skills/            # meshy-pipeline, opencv-calibration, threejs-viewer, release-post
├── frontend/
│   └── src/{components,hooks,lib}/   # UploadZone, ModelViewer, DimensionPanel, ProgressStages, ErrorCard
├── backend/
│   ├── app/
│   │   ├── main.py            # FastAPI, CORS for localhost:5173
│   │   ├── routers/{generate.py, jobs.py, measure.py}
│   │   ├── services/{meshy.py, calibrate.py, validate.py}
│   │   └── models/            # pydantic schemas
│   ├── tests/
│   └── requirements.txt
├── experiments/fixtures/      # cached Meshy responses + sample.glb
├── .env.example
└── .gitignore                 # .env, node_modules, __pycache__, backend/storage/
```

## Phased roadmap

### PHASE 1 (done, weeks 1–3): photo → model on screen

- `POST /api/generate`: multipart image upload → Meshy image-to-3d → `202 {job_id}`
- `GET /api/jobs/{id}` → `{status: pending|processing|succeeded|failed, stage, model_url, error}`
- Frontend: UploadZone (drag-drop, jpg/png <10MB validation) → ProgressStages → ModelViewer (GLB, OrbitControls, studio lighting)
- DONE = upload a mug photo, spin the 3D mug in the browser.
- Verified against the real Meshy API (not just `MOCK_MESHY`): real task
  creation, server-side polling through Analyzing/Building/Texturing, and a
  real downloaded GLB served from `/storage/`. `MOCK_MESHY` is kept `1` in
  `.env` day-to-day so routine dev work doesn't spend real credits.

### PHASE 2 (done, weeks 4–8): measurements & resize

- `calibrate.py`: card detection (contours + approxPolyDP, aspect 1.586 ± 0.12,
  confidence ≥0.6 else "not detected"); coin via HoughCircles; mm_per_px;
  object bounding dims via minAreaRect; depth = min(w,h)*0.8 flagged
  "depth_estimated"
- DimensionPanel: W/H/D in mm, editable, aspect-lock ON by default;
  "estimated" amber badge when no reference
- DONE = photo next to card → dimensions within ~5% of ruler truth.
- Real photo validation still needed: current tests use synthetic fixtures
  (no camera/physical objects available) — real ruler-measured photos would
  tighten confidence in the 5%/8% tolerances.

### PHASE 3 (done, weeks 9–12): gestures

MediaPipe (`@mediapipe/tasks-vision` HandLandmarker): palm = orbit, pinch =
zoom, two-hand stretch = resize. Optional toggle (`useHandGestures` hook,
off by default); mouse/OrbitControls stays primary and fully unaffected when
gestures are off.
- Sensitivity multipliers (orbit ×4, zoom ×3, resize clamp 0.9–1.1) are
  untested guesses — no webcam/browser available to tune them against real
  hand movement. Needs real-device tuning pass.
- `frameloop="demand"` note: gesture deltas arrive from an independent
  `requestAnimationFrame` loop outside R3F, so `GestureController` must call
  `invalidate()` unconditionally every tick while mounted — gating it on
  "did anything change" stalls the render loop the first frame nothing moved.

### PHASE 4 (done, weeks 13–16): AI assistant

Claude tool use (`backend/app/services/assistant.py`, model `claude-opus-4-8`,
manual tool loop capped at 5 iterations): `set_dimensions`, `rotate_view`,
`run_print_check`, `export_model` (glb/stl via trimesh — STEP not supported,
mesh→STEP isn't a meaningful conversion), `explain_object`. Actions returned
to the frontend visibly update the model: dimensions merge into
`DimensionPanel`'s state, `rotate_view` drives `ModelViewer`'s camera via an
imperative handle, `export_ready` renders a download link in the chat.
- `run_print_check` is a watertightness heuristic only — real wall-thickness
  and overhang analysis isn't implemented (that's `services/validate.py`,
  still a stub).
- Not yet tested against the real Anthropic API — `ANTHROPIC_API_KEY` is
  blank in `.env`, so live calls haven't been exercised. Tests mock the
  Anthropic client entirely. Spending real credits needs the user to add a
  real key and explicitly say so first.

### >>> PHASE 5 (CURRENT, weeks 17–20): platform

Supabase auth + object library, STL/GLB/STEP export with validation report,
landing page, error-state audit.
- Done: `services/validate.py` (wall thickness via ray-cast sampling,
  overhang detection excluding the build-plate base, stability from
  bounding-box aspect ratio), wired into the assistant's `run_print_check`;
  hero/landing section on the app's idle state; error-audit pass added a
  missing `calibration_failed` error path in `/measure` and a missing
  Anthropic-error catch in `/assistant`.
- Not done: Supabase auth + object library. Needs (a) the user's explicit
  go-ahead to create a real cloud project — this is real external
  infrastructure, not something to spin up unprompted — and (b) the
  Supabase MCP reconnected (it disconnected mid-session).
- Meshy is resolved: real API key configured, real generation verified
  end-to-end. Anthropic is still blocked — the account returned "credit
  balance too low" on the one live smoke-test call made this session (which
  is how the `assistant_error` gap above was actually found); needs the
  user to add credit before the assistant can be tested live.

## Meshy rules (critical — credits cost money)

- All Meshy calls only in `backend/app/services/meshy.py`. Retry: 3 attempts,
  backoff 1s/2s/4s, 5xx only.
- `POST https://api.meshy.ai/openapi/v1/image-to-3d {image_url, enable_pbr:false}`
  → task id; poll `GET .../{id}` every 5s server-side, 10-min timeout; on
  `SUCCEEDED` download `model_urls.glb` to `backend/storage/` and serve it
  ourselves (Meshy's signed URLs expire).
- Stage mapping: progress `<50` "Analyzing photo", `≥50` "Building geometry",
  `≥85` "Texturing".
- **`MOCK_MESHY=1` env flag**: identical code path, fake job id, simulated
  progress 20/55/90 then `SUCCEEDED` with `experiments/fixtures/sample.glb`.
  Build all UI in mock mode. Cache real responses as fixtures.

## Engineering conventions (strict)

- Errors are product: every failure returns `{error_code, human_message,
  suggested_action}`; no stack traces to UI; ErrorCard displays
  `human_message`.
- Honest progress: staged labels, never a bare spinner.
- pytest for every service (mock HTTP with respx — never network in tests);
  `calibrate.py` is test-first against fixture photos with `truth.json` (5%
  flat-on, 8% angled tolerances — tune constants, never loosen assertions).
- Types everywhere; shared API types mirrored in `frontend/src/lib/types.ts`.
- Conventional commits (`feat:`/`fix:`/`test:`/`chore:`), phase-scoped where
  it applies (e.g. `feat(phase2): ...`); commit after each working increment
  and push to `origin/main`; main always runnable. Plain commit messages, no
  AI co-author trailer.
- Secrets only via `.env`; keep `.env.example` current; never hardcode keys.
- Boring proven libraries only; ask before adding anything beyond the stack
  list. No premature abstraction.
- Viewer: normalize GLB scale on load (Box3 → max dim 2 world units, keep
  scale factor), dispose geometries/materials on unmount, `frameloop="demand"`,
  `dpr [1,2]`.
- UI: dark navy `#0B1120` base, teal `#2DD4BF` accents, coral `#FF7A50`
  highlights, sentence-case labels.

## Tooling directives

- Before touching a file, check `.claude/skills/` for a matching skill and
  load it first: `meshy-pipeline` for `meshy.py`/`generate.py`/`jobs.py`;
  `opencv-calibration` for `calibrate.py`/`measure.py`; `threejs-viewer` for
  `ModelViewer`/`DimensionPanel`/anything R3F. Load `release-post` (and draft
  the post unprompted) whenever a phase/feature completes.
- For library/API questions (Meshy params, drei API, MediaPipe syntax): web
  search current docs, never guess from memory — APIs change.
- Phase 5 (Supabase): use the Supabase MCP directly for tables/SQL/logs
  instead of handing over manual SQL. Vercel MCP for deploy/build-log issues.
  Figma MCP for pulling design context when a Figma link exists.
- Standing behaviors, no need to ask permission each time: run tests after
  every implementation and fix failures before moving on; run
  lint/typecheck before every commit; when a bug involves an external
  service, check its real response/logs before theorizing; self-review the
  diff against these conventions before reporting done.
- Don't web search things already answered in this file or in a skill. Don't
  call the real Meshy API when `MOCK_MESHY=1` already covers it (credits
  cost money) — use mock mode by default unless told otherwise. Don't add
  new MCPs/dependencies without asking first.
- Creating real external resources (a live Supabase project, spending real
  Meshy/Anthropic API credits, anything with an account/cost footprint
  outside this repo) always gets flagged and confirmed first, even during an
  otherwise "keep going, don't stop" run.

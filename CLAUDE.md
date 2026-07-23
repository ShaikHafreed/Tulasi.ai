# Tulasi — AI-native 3D design (Tulasi.ai)

Solo-founder project (Hafreed). Converts a photo of a physical object into an
editable 3D model with real-world measurements.

Positioning: "Meshy makes it look right. Tulasi makes it FIT right." The
differentiator is dimensional accuracy via reference-object calibration
(photograph next to a coin/card → real millimeters), not mesh-generation
quality, which is already commoditized (Meshy, Tripo, Rodin).

## Actual current state — do not assume anything beyond this exists

**Built and working:**
- Frontend only: React 19 + Vite + TypeScript, Tailwind CSS v4, real
  shadcn/ui (Button, Card, Input, Label, Dialog, Badge, Separator on Radix
  primitives)
- Supabase project `tulasi-ai` (live, project ref `hovcinzmiwwmugvxbirf`) —
  auth only: email/password + Google OAuth + GitHub OAuth, verified working
  end-to-end
- Design system: dark-first, navy `#0b0f1a` background, teal `#2dd4bf`
  primary, coral `#ff7a50` accent, faint blueprint-grid background.
  Fonts (adopted from the Lovable landing design, loaded via Google Fonts in
  `index.html`): **Instrument Serif** display (`font-display`), **Inter** body
  (`font-sans`), **JetBrains Mono** for data/technical readouts (`font-mono`,
  the "technical instrument" identity now lives in the mono data font, not the
  headings). Brand colour tokens `--teal`/`--coral`/`--navy`/`--navy-deep`/
  `--blueprint` are exposed as Tailwind utilities (`text-teal`, `bg-coral`,
  `bg-navy-deep`, …) alongside the shadcn semantic tokens.
  Signature surface treatments in `index.css`: `.clay` (claymorphism — soft
  dual shadows, puffy rounded tiles, used for bento-grid dashboard/feature
  tiles) and `.liquid-glass` (frosted translucent panels with an animated
  sheen, used for floating/overlay surfaces — ChatPanel, Dialog, the landing
  calibration readout). Both are unlayered CSS so they intentionally
  override Tailwind's `bg-card`/border/shadow utilities on the elements they're
  applied to.
- `LandingPage.tsx` — hero with a calibration-readout animation, feature
  comparison vs. Meshy/Tripo/Rodin, 4-feature grid, CTA
- `AuthCard.tsx` — shadcn Dialog, real OAuth wired
- `HomePage.tsx` + `Sidebar.tsx` — post-signin dashboard, horizontal nav with
  hover-tracked sliding indicator, four sections: Dashboard (real scan count
  from Supabase + onboarding checklist), Library (real `scans` rows,
  click-to-view with before/after slider + share toggle), New scan (full
  pipeline, live), Settings (units, gesture/voice toggles, sign out)

**Shipped feature phase — all live, tested, pushed to `origin/main`:**
- Full New-scan pipeline: `UploadZone` (up to 4 labelled angle photos) →
  "confirm your object" crop step (`SubjectSelect`/`SubjectCropper`, OpenCV
  box suggestion in `services/subject.py` via `POST /api/detect-subject`) →
  `ProgressStages` → `ModelViewer` → `DimensionPanel`. Writes real `scans`
  rows (retains the original photo for the slider).
- Backend routers: `generate/jobs/measure/scans/share/assistant/character/
  voice`; services: `meshy/calibrate/validate/exporter/subject/rag/assistant/
  voice`. Meshy single- **and** multi-image (`multi-image-to-3d`).
- Presentation mode; AI assistant (Stage A); webcam + glove gestures; RAG
  over Meshy docs; character rigging; real-scale STL/GLB export
  (`services/exporter.py`, trimesh).
- Command palette (⌘K), mm/inch unit toggle (`lib/units.ts`), before/after
  slider, first-run onboarding checklist, shareable read-only `/share/{slug}`.
- Lovable landing design ported (scroll sketch→model hero) with the
  mug-handle-outside and blueprint-grid fixes applied.

**Object recognition (done):** `routers/recognize.py` + `services/recognize.py`
+ `MOCK_RECOGNIZE` (default 1) + `ObjectRecognitionStep`. `POST /api/recognize`
identifies the object(s) (Claude vision when credit exists; an honest OpenCV
box guess with a *null* label in mock mode — never a faked label). The scan
flow is Upload → **recognise/confirm/adjust** → crop → Generate.

**Gestures (done, single-hand):** `lib/webcamGesture.ts` is `numHands=1`,
ignores any second hand, skips low-confidence frames (handedness score < 0.5),
and 150ms-debounces the classified gesture type before firing. Unified
`components/gesture/GestureStatusIndicator` (off / webcam-active / glove-linked)
lives in the nav, wired to the real persisted toggles.

**Full Lovable UI ported:** the app shell (numbered mono nav, teal sliding
indicator, gesture status, present button, radial glow), Dashboard, Library,
Settings, and ProgressStages all carry the Lovable design on **real data**.
Deferred: assistant full-screen restyle (the floating `ChatPanel` is already
on-brand + real) and a standalone print-report screen (needs a new nav item +
real validation surface).

**`scans` table** (Supabase, RLS enabled, FK `user_id -> auth.users.id`):
`id, user_id, job_id, object_name, model_url, image_url, source_image_url,
width_mm, height_mm, depth_mm, depth_estimated, share_slug, created_at`.
(`source_image_url` = original photo for the before/after slider; `share_slug`
= unguessable public-share id, null when private, with an anon-role RLS read
policy scoped to rows that have a slug.)

**Already provisioned, reuse — do not recreate:**
- Supabase project + `scans` table schema
- Meshy account, real API key, ~1500 credits
- Anthropic API key present but **$0 credit** — Claude API calls fail until
  topped up. Anything Claude-dependent gets built behind a mock flag.
- Google + GitHub OAuth apps, correctly configured in Supabase

## Known regression risks

- **Mug handle geometry** (`frontend/src/components/landing/SketchToModelHero.tsx`,
  `Mug` component): the handle torus has clipped through the cup interior
  across at least two prior Lovable regenerations, most recently by a flipped
  rotation sign (`+Math.PI/2` instead of the correct `-Math.PI/2`) in the
  2026-07-23 warm-retheme sync — verified by actually running the Three.js
  vertex math (`TorusGeometry` + the real position/rotation transform), not
  by eyeballing the render, since the bug is easy to miss from the default
  hero camera angle alone. Position/rotation are named constants
  (`CUP_RADIUS`, `HANDLE_REACH`) with a dev-mode console assertion that
  measures every real handle vertex's distance from the mug's central axis
  on mount and fails loudly if it dips inside `CUP_RADIUS` or fails to clear
  `CUP_RADIUS + HANDLE_REACH`. If a future Lovable sync touches this file
  again: diff it first, and if the incoming version changes `HANDLE_POS`/
  `HANDLE_ROT`, re-run the vertex check before accepting it — don't assume a
  freshly-generated Lovable output already got this right, it hasn't twice
  before.

## Conventions

- Push every commit to `origin/main` immediately, not just local commits
- Plain commit messages, no AI co-author trailer
- Real secrets in `.env` (gitignored) — never in `.env.example`
- Empty/unbuilt states say honestly what's missing — no fake data, no
  polished placeholders pretending to work
- Update README alongside every LinkedIn/build-in-public post
- "Day N" build-in-public counter: Day 2 = 2026-07-10, count forward from
  there

## Repo structure

```
Tulasi.ai/
├── CLAUDE.md
├── frontend/
│   └── src/
│       ├── components/
│       │   ├── LandingPage.tsx / AuthCard.tsx / HomePage.tsx / Sidebar.tsx
│       │   ├── ui/            # shadcn primitives
│       │   ├── scan/          # UploadZone, ProgressStages, ModelViewer
│       │   └── assistant/     # Phase 3: ChatPanel, MessageBubble, ActionConfirmCard
│       └── lib/
│           ├── supabase.ts, api.ts, types.ts, utils.ts
│           ├── tulasiEvents.ts       # Phase 3: app-side event bus
│           ├── tulasiCommands.ts     # Phase 3: whitelisted command API
│           ├── tulasiAssistant.ts    # Phase 3: shared chat-turn logic (app + extension)
│           └── extensionBridge.ts    # Stage B: postMessage bridge for the extension
├── backend/
│   ├── app/
│   │   ├── main.py            # FastAPI, CORS for the Vite dev origin
│   │   ├── errors.py, job_store.py, supabase_client.py
│   │   ├── routers/{generate.py, jobs.py, measure.py, assistant.py}
│   │   ├── services/{meshy.py, calibrate.py, validate.py, assistant.py, uploads.py}
│   │   └── models/            # pydantic schemas
│   ├── tests/
│   └── requirements.txt
├── extension/                 # Stage B: Manifest V3 side-panel companion
├── experiments/fixtures/      # cached Meshy responses + sample.glb
└── .gitignore
```

## Phased roadmap

### PHASE 1 (DONE): backend rebuild + real scan flow

- `POST /api/generate`: multipart image upload → Meshy image-to-3d →
  `202 {job_id}`
- `GET /api/jobs/{id}`: `{status: pending|processing|succeeded|failed, stage,
  model_url, error}`
- Meshy rules: all calls in `services/meshy.py` only; retry 3x on 5xx with
  1s/2s/4s backoff; download GLB to `backend/storage/` and serve it ourselves
  (signed URLs expire); stage labels: `<50` "Analyzing photo", `≥50`
  "Building geometry", `≥85` "Texturing"
- `MOCK_MESHY=1`: identical code path, fake job id, simulated progress
  20/55/90 then succeeded serving `experiments/fixtures/sample.glb`. Build
  the whole UI in mock mode — real credits are for final verification only.
  **`MOCK_MESHY=0` in local `.env` now** — real Meshy generation is live;
  verified end-to-end (auth → task → poll → real GLB download).
- Library thumbnails are a **render of the generated 3D model**, not the
  uploaded photo. `ModelViewer` captures a canvas snapshot
  (`gl.domElement.toDataURL`, needs `preserveDrawingBuffer: true`) once the
  model first renders and uploads it via `POST /api/scans/{job_id}/thumbnail`,
  which overwrites the scan's `image_url` (`PATCH`-style, needs the `scans`
  RLS UPDATE policy). The source photo is what `image_url` holds
  *immediately* after upload (before the model exists) — it gets replaced by
  the 3D render shortly after, so the row is only ever transiently on the
  photo. `DELETE /api/scans/{job_id}` removes the Supabase row and every
  local file (`.glb`, `_source.*`, `_thumb.jpg`).
- Frontend: `UploadZone` (drag-drop, jpg/png <100MB) → `ProgressStages`
  (honest staged labels, never a bare spinner) → `ModelViewer` (Three.js +
  @react-three/fiber + drei, GLB normalized to consistent world scale on
  load, OrbitControls, dispose on unmount)
- On success, write a real row to `scans` (backend, using the requesting
  user's JWT so RLS applies naturally — no service-role key)
- Errors are product: every failure returns `{error_code, human_message,
  suggested_action}`; no stack traces reach the UI
- DONE = upload a photo from the real dashboard, watch it generate, see it
  in the viewer, see it appear in Library.

### PHASE 2 (DONE): measurement & calibration

- `calibrate.py`: credit-card detection (contours + approxPolyDP, aspect
  ratio 1.586 ± 0.12, confidence ≥0.6 else "not detected"), coin fallback via
  HoughCircles, `mm_per_px`, object bounding dims via `minAreaRect`, depth
  estimated as `min(w,h) * 0.8`, always flagged `depth_estimated: true`
- `DimensionPanel`: W/H/D in mm, editable, aspect-lock on by default, amber
  "estimated" badge when no reference detected
- Test-first: fixture photos + `truth.json` with ruler-measured dimensions;
  5% tolerance flat-on, 8% angled; tune constants, never loosen assertions
- DONE = photograph an object next to a card, dimensions land within ~5% of
  ruler truth, editable in the panel, model updates on resize.

### >>> PHASE 3 (DONE, needs your real-usage check): Tulasi AI copilot — in-app only (Stage A)

Converses, asks clarifying questions, proposes actions, executes with
permission, improves from feedback. In-app chat panel first — no browser
extension yet, since the assistant needs Phase 1–2 to actually exist before
it has anything to assist with.

- **Event bus** (`lib/tulasiEvents.ts`): semantic events only —
  `scan_started`, `dimensions_changed`, `reference_detected`,
  `print_check_run`, `export_requested`, `undo`, `redo`. Rolling buffer of
  ~30 events as session context. No DOM scraping, ever.
- **Command API** (`lib/tulasiCommands.ts`): strict whitelist —
  `setDimensions`, `rotateView`, `runPrintCheck`, `exportModel`,
  `addReferenceHint`. The assistant never touches app state directly.
- `POST /api/assistant/message` → `{reply, proposed_actions:
  [{action, params, reversible}]}`. `services/assistant.py` wraps Claude
  tool use; tools mirror the command API 1:1.
- `MOCK_ASSISTANT=1` (needed now — $0 Anthropic credit): canned but
  realistic replies so the UI and confirm/auto-run flow can be built before
  topping up credit.
- **Live mode** (toggle in the chat panel header): subscribes to the same
  event bus in real time and proactively reacts (e.g. "no reference
  detected, rescan with a card/coin in frame") instead of waiting for the
  user to type. Scoped to the page by construction — the event bus is
  in-memory React state with no cross-tab/cross-site visibility. Only
  reacts to genuinely user-caused events (`scan_started`,
  `reference_detected`, debounced `dimensions_changed`) — never to
  `print_check_run`/`export_requested`, since those are themselves results
  of an assistant action and reacting to them would be the assistant
  talking to itself. A suggested-prompt chip ("What have I done so far?")
  triggers an activity summary from the event buffer.
- `reversible: true` actions auto-run with a toast; `reversible: false`
  (resize, export, overwrite) show a confirm button first. Thumbs up/down
  logged to a new `assistant_feedback` Supabase table.
- DONE = open the chat, describe a goal, get asked a clarifying question,
  get a suggestion, confirm it, watch the model update.

### Character rigging & animation (explicit opt-in, real Meshy credits)

Product-scope expansion, requested explicitly — Tulasi's core use case is
static printable objects (mugs, brackets, hinges), which **cannot** be
rigged; Meshy's own docs are explicit that rigging "only works well with
standard humanoid (bipedal) [or quadruped] assets with clearly defined
limbs." This is why it's a separate, opt-in "Is this a character?" action
(`CharacterRig.tsx`) shown after a real (non-mock) scan, never automatic.

- `services/meshy.py`: `process_rig_job` (`POST /openapi/v1/rigging` using
  the scan's stored `meshy_task_id`, ~5 credits) and `process_animation_job`
  (`POST /openapi/v1/animations` with a curated subset of Meshy's 500+
  presets — real `action_id`s from `docs.meshy.ai/api/animation-library`,
  ~3 credits per clip). Both poll and download the same way `image-to-3d`
  does. Non-humanoid rejections are parsed into an honest human-readable
  error, not a generic failure.
- `routers/character.py` / `character_store.py`: same in-memory job-record
  pattern as scans. `GET /api/character/presets` lists the curated presets.
- Rigging is a hard no-op in `MOCK_MESHY=1` — there's no real `meshy_task_id`
  to rig, so it fails immediately with a clear message rather than pretending.
- Rejection path live-verified against a real non-character scan: Meshy's
  actual error is `422 {"message":"Pose estimation failed, please provide a
  valid model"}` — note this doesn't match the wording on Meshy's own docs
  page ("non-humanoid", "unclear limb structure"), so `_REJECTION_KEYWORDS`
  in `meshy.py` covers both. The rejection can also arrive synchronously at
  task-creation time (this case) as well as async via polling — both are
  handled.
- **Face-limit auto-remesh**: Meshy refuses to rig models over 300k faces
  (live-verified: a real humanoid scan came back 310,160 faces →
  `400 "...exceeds the 300,000 face limit..."`). `process_rig_job` catches
  this and transparently remeshes first (`POST /openapi/v1/remesh`,
  `target_polycount=100_000`, triangle topology), then rigs the remesh
  task id. Costs extra credits but turns a hard failure into the feature.
- `_request_with_retry` retries transport-level failures (DNS/TLS/resets/
  timeouts) with the same 1s/2s/4s backoff as 5xx — a live-observed
  `httpx.ConnectError` during TLS setup used to instantly fail a whole
  rig job on one network blip.

### Stage B — browser extension (built, needs real-world Stage A usage before relying on it)

Built ahead of the original "one week of Stage A usage" gate, at explicit
request. `extension/` — Manifest V3, `host_permissions` scoped to
`https://tulasi.ai/*` and `http://localhost:5173/*` (dev), `chrome.sidePanel`.
`content-script.js` only relays whitelisted `postMessage` payloads between the
side panel and the web app's own `lib/extensionBridge.ts` — never DOM
scraping, never broader site access. The side panel talks to the active
Tulasi tab only; it never calls the backend directly, so it reuses the Phase
3 backend unchanged. Load via `chrome://extensions` → Developer mode → Load
unpacked → select `extension/`.

### Stage C — voice (built)

TTS via voice-cloning (OpenVoice, self-hosted, CPU inference) using Hafreed's
own recorded voice. `backend/app/services/voice.py` + `routers/voice.py` —
`POST /api/voice/speak {text} -> audio/wav`. Consent recorded in
`backend/voice/consent.json` (gitignored, never committed — biometric data).
Models, reference embedding (`target_se.pth`), and enrollment script also
live in `backend/voice/` (gitignored). Verified end-to-end against 5 real
reference clips (~11s combined) through the actual API endpoint, not just a
standalone script.

Frontend: Settings → "Assistant voice replies" toggle, **default OFF**
(`lib/voicePreference.ts`, localStorage). When on, `ChatPanel` fetches and
plays audio for each assistant reply — the reply text is always shown as the
caption regardless of the toggle, satisfying "captions always shown
alongside audio" unconditionally.

`MOCK_VOICE` env flag (separate from the frontend toggle) gates real model
inference vs. a silent placeholder — real inference needs ffmpeg on PATH and
one-time approval to fetch `snakers4/silero-vad` via `torch.hub`.

## Meshy rules (critical — credits cost money)

- All Meshy calls only in `backend/app/services/meshy.py`. Retry: 3
  attempts, backoff 1s/2s/4s, 5xx only.
- `POST https://api.meshy.ai/openapi/v1/image-to-3d` with
  `Authorization: Bearer <key>` and a base64 data-URI image (no file hosting
  needed) → `{"result": "<task_id>"}`. Poll
  `GET https://api.meshy.ai/openapi/v1/image-to-3d/:id` every 5s
  server-side, 10-min timeout. On `SUCCEEDED`, download `model_urls.glb` to
  `backend/storage/` (Meshy's signed URLs expire).

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
  primary, coral `#ff7a50` accent, monospace display font for data
  ("technical instrument" identity), faint blueprint-grid background
- `LandingPage.tsx` — hero with a calibration-readout animation, feature
  comparison vs. Meshy/Tripo/Rodin, 4-feature grid, CTA
- `AuthCard.tsx` — shadcn Dialog, real OAuth wired
- `HomePage.tsx` + `Sidebar.tsx` — post-signin dashboard, horizontal nav with
  hover-tracked sliding indicator, four sections: Dashboard (real scan count
  from Supabase), Library (lists real `scans` table rows), New scan (being
  built now — see roadmap), Settings (email/provider/sign out)

**`scans` table** (Supabase, RLS enabled, FK `user_id -> auth.users.id`):
`id, user_id, job_id, object_name, model_url, width_mm, height_mm, depth_mm,
depth_estimated, created_at`.

**Already provisioned, reuse — do not recreate:**
- Supabase project + `scans` table schema
- Meshy account, real API key, ~1500 credits
- Anthropic API key present but **$0 credit** — Claude API calls fail until
  topped up. Anything Claude-dependent gets built behind a mock flag.
- Google + GitHub OAuth apps, correctly configured in Supabase

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

### DEFERRED — do not build without explicit ask

- **Stage C — voice**: TTS via voice-cloning using Hafreed's own recorded
  voice, explicit consent on file, default OFF, captions always shown
  alongside audio. Blocked on Hafreed providing a real voice recording +
  consent statement — cannot proceed without that input.

## Meshy rules (critical — credits cost money)

- All Meshy calls only in `backend/app/services/meshy.py`. Retry: 3
  attempts, backoff 1s/2s/4s, 5xx only.
- `POST https://api.meshy.ai/openapi/v1/image-to-3d` with
  `Authorization: Bearer <key>` and a base64 data-URI image (no file hosting
  needed) → `{"result": "<task_id>"}`. Poll
  `GET https://api.meshy.ai/openapi/v1/image-to-3d/:id` every 5s
  server-side, 10-min timeout. On `SUCCEEDED`, download `model_urls.glb` to
  `backend/storage/` (Meshy's signed URLs expire).

---
name: meshy-pipeline
description: Rules for calling the Meshy image-to-3D API from backend/app/services/meshy.py — retry policy, polling cadence, stage-label mapping, and the MOCK_MESHY fixture path. Use when writing or reviewing any code that talks to Meshy, or when adding features that consume job status.
---

# Meshy pipeline rules

Meshy credits cost real money. Every rule here exists to avoid burning them
on bugs or accidental retries.

## Where Meshy calls live

All Meshy HTTP calls live in `backend/app/services/meshy.py` and nowhere
else. Routers call the service; they never call `httpx` directly.

## Task creation

`POST https://api.meshy.ai/openapi/v1/image-to-3d`
- Auth: `Authorization: Bearer <MESHY_API_KEY>`
- Body: `{"image_url": <data-uri-or-public-url>, "enable_pbr": false}`
- For uploaded files with no public URL, base64-encode into a
  `data:<content-type>;base64,<...>` URI — Meshy accepts this directly, no
  file hosting needed.
- Response: `{"result": "<task_id>"}`.

## Polling

- Poll `GET https://api.meshy.ai/openapi/v1/image-to-3d/:id` every 5 seconds,
  server-side (the backend polls Meshy in a background task — the frontend
  polls *our* `/api/jobs/{id}`, never Meshy directly).
- 10-minute timeout per job; past that, mark the job `failed` with
  `error_code="timeout"`.
- Retry individual HTTP calls 3 times with 1s/2s/4s backoff, **only on 5xx**
  responses. 4xx (bad key, bad request) fails immediately — retrying won't
  help and wastes time.

## Stage labels

Map Meshy's `progress` (0–100) to a human stage label for the UI:
- `progress < 50` → "Analyzing photo"
- `50 <= progress < 85` → "Building geometry"
- `progress >= 85` → "Texturing"

Never show a bare spinner — always a staged label.

## On success

Download `model_urls.glb` to `backend/storage/{job_id}.glb` and serve it
ourselves from there. Meshy's signed URLs expire, so the job's `model_url`
in our API must point at our own `/storage/...` path, not Meshy's.

## Mock mode

`MOCK_MESHY=1` makes `services/meshy.py` take an identical code path but:
- returns a fake job id instead of calling Meshy
- simulates progress 20 → 55 → 90 → `SUCCEEDED`
- points `model_url` at a copy of `experiments/fixtures/sample.glb`

Build and test all UI against mock mode first. Only flip to real mode
(`MOCK_MESHY=0`) with a real `MESHY_API_KEY` when verifying the live
integration — and treat every real call as spending money, so don't loop or
retry casually while debugging.

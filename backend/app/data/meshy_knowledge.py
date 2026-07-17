"""Curated Meshy API / rigging knowledge base for the assistant's RAG lookup
(see services/rag.py). Content is sourced from docs.meshy.ai (fetched
2026-07-17) plus this codebase's own live-verified production behavior —
see CLAUDE.md's "Character rigging & animation" section. The two don't
always agree (e.g. the real rejection error's wording differs from the
docs), and where they conflict that's noted explicitly rather than picking
one silently.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class KnowledgeDoc:
    id: str
    title: str
    text: str
    source_url: str


DOCS: list[KnowledgeDoc] = [
    KnowledgeDoc(
        id="rigging-requirements",
        title="What models Meshy can rig",
        text=(
            "Meshy's rigging API only works well on standard humanoid (bipedal) assets with "
            "clearly defined limbs and body structure. Untextured meshes, non-humanoid assets, "
            "and humanoid assets with unclear limb structure are all unsuitable and get "
            "rejected. The character's face must point toward the +Z axis (glTF forward "
            "direction). This is exactly why Tulasi treats rigging as an explicit opt-in "
            "'Is this a character?' action rather than something offered automatically after "
            "every scan — most Tulasi scans (mugs, brackets, hinges) are not rigging candidates."
        ),
        source_url="https://docs.meshy.ai/en/api/rigging",
    ),
    KnowledgeDoc(
        id="rigging-rejection-error",
        title="What the rejection error actually looks like in production",
        text=(
            "Meshy's docs describe the rejection error as 422 'Pose estimation failed. The "
            "provided model may not be a valid humanoid character.' In real production use "
            "against Tulasi's own scans, the error that actually comes back is worded slightly "
            'differently: 422 {"message": "Pose estimation failed, please provide a valid '
            'model"}. Tulasi\'s backend (_REJECTION_KEYWORDS in services/meshy.py) matches both '
            "phrasings so the honest 'rigging only works on humanoid or quadruped character "
            "shapes with clear limbs' message reaches the user either way. The rejection can "
            "arrive synchronously at task-creation time, or asynchronously while polling — both "
            "are handled the same way."
        ),
        source_url="https://docs.meshy.ai/en/api/errors",
    ),
    KnowledgeDoc(
        id="rigging-face-limit",
        title="The 300,000-face rigging limit and auto-remesh",
        text=(
            "When rigging a model via input_task_id, Meshy rejects anything over 300,000 faces "
            "with a 400 error, and recommends running it through the Remesh API first. Tulasi "
            "automates this: process_rig_job in services/meshy.py catches that specific 400, "
            "transparently calls POST /openapi/v1/remesh with target_polycount=100000 and "
            "triangle topology, then rigs the remesh output instead of failing outright. This "
            "was live-verified against a real scan that came back at 310,160 faces. It costs "
            "extra credits but turns a hard failure into a working feature."
        ),
        source_url="https://docs.meshy.ai/en/api/rigging",
    ),
    KnowledgeDoc(
        id="rigging-endpoint",
        title="Rigging API endpoint and cost",
        text=(
            "Create a rigging task with POST /openapi/v1/rigging, passing either an "
            "input_task_id (from a prior Image-to-3D or Remesh task) or a model_url pointing at "
            "a public .glb. Poll GET /openapi/v1/rigging/:id for status (PENDING, IN_PROGRESS, "
            "SUCCEEDED, FAILED, CANCELED). A successful rig costs 5 credits; failed tasks are "
            "not charged. On success you get a rigged character plus basic walking and running "
            "animations, in both FBX and GLB."
        ),
        source_url="https://docs.meshy.ai/en/api/rigging",
    ),
    KnowledgeDoc(
        id="animation-api",
        title="Animation API and the preset library",
        text=(
            "Once a model is rigged, create an animation with POST /openapi/v1/animations, "
            "passing the rig_task_id and an action_id for the preset you want (e.g. action_id "
            "92 is 'Reaping Swing' in Meshy's own example). The full list of 500+ presets lives "
            "at docs.meshy.ai/api/animation-library. Tulasi doesn't expose all 500+ — "
            "routers/character.py's GET /api/character/presets serves a curated subset of real "
            "action_ids so the UI stays simple. Each animation clip costs roughly 3 credits."
        ),
        source_url="https://docs.meshy.ai/en/api/animation",
    ),
    KnowledgeDoc(
        id="remesh-api",
        title="Remesh API parameters",
        text=(
            "POST /openapi/v1/remesh reduces or reshapes a model's topology. Pass either "
            "input_task_id or model_url, plus target_polycount (default 30,000, valid range "
            "100-300,000) and topology ('triangle' for a decimated triangle mesh, the default, "
            "or 'quad' for a quad-dominant mesh). Tulasi's auto-remesh-before-rigging path uses "
            "target_polycount=100000 with triangle topology specifically."
        ),
        source_url="https://docs.meshy.ai/en/api/remesh",
    ),
    KnowledgeDoc(
        id="image-to-3d-api",
        title="Image-to-3D API basics",
        text=(
            "POST https://api.meshy.ai/openapi/v1/image-to-3d with a Bearer API key and a "
            'base64 data-URI image (no separate file hosting needed) kicks off generation and '
            'returns {"result": "<task_id>"}. Poll GET .../image-to-3d/:id every few seconds '
            "until status is SUCCEEDED, then download model_urls.glb yourself — Meshy's signed "
            "URLs expire, so Tulasi always re-hosts the file in backend/storage/ rather than "
            "linking to Meshy's URL directly."
        ),
        source_url="https://docs.meshy.ai/en/api/image-to-3d",
    ),
    KnowledgeDoc(
        id="network-retry",
        title="Why Meshy calls retry on network errors, not just 5xx",
        text=(
            "Tulasi's _request_with_retry wraps every Meshy call with the same 1s/2s/4s backoff "
            "for two different failure classes: Meshy's own 5xx server errors, and pure network "
            "transport failures (DNS resolution, TLS handshake resets, connection timeouts) that "
            "never reach Meshy at all. This was added after a live-observed httpx.ConnectError "
            "during TLS setup instantly failed a whole rig job on a single network blip — "
            "before that fix, a transient local network hiccup looked identical to Meshy being "
            "down."
        ),
        source_url="internal:services/meshy.py",
    ),
    KnowledgeDoc(
        id="error-codes-general",
        title="Meshy's general HTTP and task error codes",
        text=(
            "Meshy uses standard HTTP status codes: 400 for a missing/invalid parameter, 401 "
            "for a bad API key, 402 for insufficient credits, 403 for disallowed CORS/browser "
            "requests, 404 for a missing resource, 429 for rate limiting, and 5xx for Meshy's "
            "own server errors. Beyond that, generation tasks can fail with specific task_error "
            "codes: image_too_complex (dense piles of small objects or intricate repeating "
            "patterns), model_missing_uv / model_insufficient_uv (texturing needs UV "
            "coordinates that aren't there or aren't good enough), invalid_input (corrupted "
            "file, unsupported format, or safety-filter rejection), moderation_blocked, "
            "timeout, and format_conversion_failed."
        ),
        source_url="https://docs.meshy.ai/en/api/errors",
    ),
]

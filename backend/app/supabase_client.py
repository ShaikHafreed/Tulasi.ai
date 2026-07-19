"""Supabase access, scoped to the requesting user's own JWT so RLS applies
naturally — no service-role key needed. The JWT is only decoded locally to
read the user id for convenience; Supabase's own API validates the token's
signature when the actual request goes out, so a bad/tampered token simply
fails there rather than writing anything.
"""

import base64
import json
import os

from supabase import Client, create_client


def bearer_token(authorization: str | None) -> str | None:
    if not authorization or not authorization.startswith("Bearer "):
        return None
    return authorization.removeprefix("Bearer ")


def _decode_user_id(access_token: str) -> str:
    payload_segment = access_token.split(".")[1]
    padding = "=" * (-len(payload_segment) % 4)
    payload = json.loads(base64.urlsafe_b64decode(payload_segment + padding))
    return payload["sub"]


def _client_as(access_token: str) -> Client:
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_PUBLISHABLE_KEY")
    if not url or not key:
        raise RuntimeError("SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY are not set")
    client = create_client(url, key)
    client.postgrest.auth(access_token)
    return client


def _anon_client() -> Client:
    # No user token — acts as the `anon` role. Only the "public can read shared
    # scans" RLS policy is reachable this way, so it can read a shared row but
    # nothing private and nothing writable.
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_PUBLISHABLE_KEY")
    if not url or not key:
        raise RuntimeError("SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY are not set")
    return create_client(url, key)


def insert_scan(
    access_token: str,
    *,
    job_id: str,
    model_url: str,
    image_url: str | None = None,
    source_image_url: str | None = None,
    width_mm: float | None = None,
    height_mm: float | None = None,
    depth_mm: float | None = None,
    depth_estimated: bool = False,
) -> None:
    client = _client_as(access_token)
    user_id = _decode_user_id(access_token)
    client.table("scans").insert(
        {
            "user_id": user_id,
            "job_id": job_id,
            "model_url": model_url,
            # image_url gets overwritten with the 3D-render thumbnail once the
            # viewer captures it; source_image_url keeps the original photo so
            # the before/after slider has both sides.
            "image_url": image_url,
            "source_image_url": source_image_url,
            "width_mm": width_mm,
            "height_mm": height_mm,
            "depth_mm": depth_mm,
            "depth_estimated": depth_estimated,
        }
    ).execute()


def insert_assistant_feedback(access_token: str, *, message: str, rating: str) -> None:
    client = _client_as(access_token)
    user_id = _decode_user_id(access_token)
    client.table("assistant_feedback").insert(
        {"user_id": user_id, "message": message, "rating": rating}
    ).execute()


def update_scan_image(access_token: str, *, job_id: str, image_url: str) -> None:
    client = _client_as(access_token)
    client.table("scans").update({"image_url": image_url}).eq("job_id", job_id).execute()


def set_share_slug(access_token: str, *, job_id: str, slug: str | None) -> None:
    # Owner-scoped (user JWT → RLS). Pass slug=None to disable sharing.
    client = _client_as(access_token)
    client.table("scans").update({"share_slug": slug}).eq("job_id", job_id).execute()


_PUBLIC_SHARE_FIELDS = "object_name,model_url,width_mm,height_mm,depth_mm,depth_estimated"


def get_shared_scan(slug: str) -> dict | None:
    # Public read via the anon role — returns only non-sensitive fields for the
    # one row carrying this exact slug, or None.
    client = _anon_client()
    result = (
        client.table("scans")
        .select(_PUBLIC_SHARE_FIELDS)
        .eq("share_slug", slug)
        .limit(1)
        .execute()
    )
    rows = result.data or []
    return rows[0] if rows else None


def delete_scan(access_token: str, *, job_id: str) -> None:
    client = _client_as(access_token)
    client.table("scans").delete().eq("job_id", job_id).execute()

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


def insert_scan(
    access_token: str,
    *,
    job_id: str,
    model_url: str,
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

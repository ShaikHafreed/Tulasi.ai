import secrets

from fastapi import APIRouter, Header

from .. import supabase_client
from ..errors import AppError
from ..models.schemas import ShareResponse, SharedScan

router = APIRouter(prefix="/api", tags=["share"])


def _require_access_token(authorization: str | None) -> str:
    access_token = supabase_client.bearer_token(authorization)
    if not access_token:
        raise AppError(
            status_code=401,
            error_code="not_authenticated",
            human_message="Sign in to manage sharing.",
            suggested_action="Sign in and try again.",
        )
    return access_token


@router.post("/scans/{job_id}/share", response_model=ShareResponse)
async def enable_share(job_id: str, authorization: str | None = Header(default=None)) -> ShareResponse:
    access_token = _require_access_token(authorization)
    # Unguessable, URL-safe slug. Owner-scoped update (RLS) — a user can only
    # slug their own scan.
    slug = secrets.token_urlsafe(9)
    supabase_client.set_share_slug(access_token, job_id=job_id, slug=slug)
    return ShareResponse(slug=slug)


@router.delete("/scans/{job_id}/share", status_code=204)
async def disable_share(job_id: str, authorization: str | None = Header(default=None)) -> None:
    access_token = _require_access_token(authorization)
    supabase_client.set_share_slug(access_token, job_id=job_id, slug=None)


@router.get("/share/{slug}", response_model=SharedScan)
async def get_shared(slug: str) -> SharedScan:
    # Public — no auth. Reads only the shared row's non-sensitive fields via
    # the anon-role RLS policy; there is no write path reachable here.
    row = supabase_client.get_shared_scan(slug)
    if not row:
        raise AppError(
            status_code=404,
            error_code="share_not_found",
            human_message="This shared model doesn't exist or sharing was turned off.",
            suggested_action="Ask for an updated link.",
        )
    return SharedScan(**row)

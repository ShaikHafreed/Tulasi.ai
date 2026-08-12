"""Central auth dependency — the FastAPI-side equivalent of a "global
authentication middleware": routes that need a real signed-in user depend on
get_current_user() instead of each router hand-rolling its own bearer-token
check. Identity is Supabase's (email/password + Google/GitHub OAuth,
already live) — this module doesn't issue or store tokens itself, it only
verifies the ones Supabase already issued, via supabase_client.verify_access_token.
"""

from dataclasses import dataclass

from fastapi import Header

from . import supabase_client
from .errors import AppError


@dataclass
class CurrentUser:
    id: str
    access_token: str


async def get_current_user(authorization: str | None = Header(default=None)) -> CurrentUser:
    token = supabase_client.bearer_token(authorization)
    if not token:
        raise AppError(
            status_code=401,
            error_code="not_authenticated",
            human_message="Sign in to continue.",
            suggested_action="Sign in and try again.",
        )

    user = supabase_client.verify_access_token(token)
    if not user:
        raise AppError(
            status_code=401,
            error_code="invalid_token",
            human_message="Your session has expired or is invalid.",
            suggested_action="Sign in again.",
        )

    return CurrentUser(id=user.id, access_token=token)

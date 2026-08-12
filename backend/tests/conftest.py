import base64

import pytest
from fastapi.testclient import TestClient

from app.auth import CurrentUser, get_current_user
from app.main import app

# Minimal 1x1 PNG, used as a stand-in "photo" upload in tests.
SAMPLE_PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
)


@pytest.fixture
def client():
    # Must be a context manager: the background asyncio task started by
    # POST /api/generate runs on the TestClient's own event-loop thread,
    # which is only kept alive for the lifetime of the `with` block.
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def sample_image_bytes() -> bytes:
    return SAMPLE_PNG


@pytest.fixture
def authed_client(client):
    # get_current_user now genuinely verifies the bearer token against
    # Supabase's Auth server (see app/auth.py) — a bare "Bearer fake-token"
    # string is correctly rejected with 401, so tests that only care about
    # OTHER validation (bad content-type, empty name, etc.) need a real
    # dependency override standing in for "a verified, signed-in user",
    # not a magic header value.
    app.dependency_overrides[get_current_user] = lambda: CurrentUser(id="test-user", access_token="fake-token")
    yield client
    del app.dependency_overrides[get_current_user]

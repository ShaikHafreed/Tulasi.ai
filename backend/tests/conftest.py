import base64

import pytest
from fastapi.testclient import TestClient

from app.main import app

# Minimal 1x1 PNG, used as a stand-in "photo" upload in tests.
SAMPLE_PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
)


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def client_as_deployed():
    # Unlike `client`, doesn't re-raise unhandled exceptions for debugging —
    # simulates what a real deployed server actually returns, for testing
    # the global fallback exception handler itself.
    with TestClient(app, raise_server_exceptions=False) as test_client:
        yield test_client


@pytest.fixture
def sample_image_bytes() -> bytes:
    return SAMPLE_PNG

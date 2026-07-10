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
    # Must be a context manager: the background asyncio task started by
    # POST /api/generate runs on the TestClient's own event-loop thread,
    # which is only kept alive for the lifetime of the `with` block.
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def sample_image_bytes() -> bytes:
    return SAMPLE_PNG

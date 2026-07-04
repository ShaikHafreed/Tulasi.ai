import httpx
import respx

from app.services.meshy import _request_with_retry


@respx.mock
async def test_retries_on_5xx_then_succeeds():
    route = respx.get("https://example.test/thing")
    route.side_effect = [
        httpx.Response(500),
        httpx.Response(500),
        httpx.Response(200, json={"ok": True}),
    ]

    response = await _request_with_retry("GET", "https://example.test/thing")

    assert response.status_code == 200
    assert route.call_count == 3


@respx.mock
async def test_does_not_retry_on_4xx():
    route = respx.get("https://example.test/thing").mock(return_value=httpx.Response(404))

    response = await _request_with_retry("GET", "https://example.test/thing")

    assert response.status_code == 404
    assert route.call_count == 1

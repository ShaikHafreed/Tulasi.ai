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


@respx.mock
async def test_retries_on_connect_error_then_succeeds():
    route = respx.get("https://example.test/thing")
    route.side_effect = [
        httpx.ConnectError("TLS handshake failed"),
        httpx.Response(200, json={"ok": True}),
    ]

    response = await _request_with_retry("GET", "https://example.test/thing")

    assert response.status_code == 200
    assert route.call_count == 2


@respx.mock
async def test_raises_after_exhausting_connect_error_retries():
    route = respx.get("https://example.test/thing")
    route.side_effect = httpx.ConnectError("network down")

    try:
        await _request_with_retry("GET", "https://example.test/thing")
        raise AssertionError("expected RuntimeError")
    except RuntimeError as exc:
        assert "kept failing" in str(exc)
    assert route.call_count == 4  # initial attempt + 3 retries

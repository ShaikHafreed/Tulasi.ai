import time

import httpx
import respx

from app import supabase_client
from app.services import meshy


def _poll_until_done(client, job_id: str, timeout: float = 10.0) -> dict:
    deadline = time.monotonic() + timeout
    status = client.get(f"/api/jobs/{job_id}").json()
    while status["status"] not in ("succeeded", "failed") and time.monotonic() < deadline:
        time.sleep(0.2)
        status = client.get(f"/api/jobs/{job_id}").json()
    return status


def test_job_not_found_returns_404(client):
    response = client.get("/api/jobs/does-not-exist")

    assert response.status_code == 404
    assert response.json()["error_code"] == "job_not_found"


def test_mock_job_completes_successfully(client, sample_image_bytes, monkeypatch, tmp_path):
    monkeypatch.setenv("MOCK_MESHY", "1")
    monkeypatch.setattr(meshy, "STORAGE_DIR", tmp_path)

    response = client.post(
        "/api/generate",
        files={"images": ("test.png", sample_image_bytes, "image/png")},
    )
    job_id = response.json()["job_id"]

    status = _poll_until_done(client, job_id)

    assert status["status"] == "succeeded"
    assert status["model_url"] == f"/storage/{job_id}.glb"
    assert (tmp_path / f"{job_id}.glb").exists()


def test_mock_job_writes_scan_when_authorized(client, sample_image_bytes, monkeypatch, tmp_path):
    monkeypatch.setenv("MOCK_MESHY", "1")
    monkeypatch.setattr(meshy, "STORAGE_DIR", tmp_path)

    calls = []
    monkeypatch.setattr(
        supabase_client,
        "insert_scan",
        lambda token, **kwargs: calls.append((token, kwargs)),
    )

    response = client.post(
        "/api/generate",
        files={"images": ("test.png", sample_image_bytes, "image/png")},
        headers={"Authorization": "Bearer fake-token"},
    )
    job_id = response.json()["job_id"]
    _poll_until_done(client, job_id)

    assert len(calls) == 1
    token, kwargs = calls[0]
    assert token == "fake-token"
    assert kwargs["job_id"] == job_id


def test_mock_job_skips_scan_write_without_authorization(client, sample_image_bytes, monkeypatch, tmp_path):
    monkeypatch.setenv("MOCK_MESHY", "1")
    monkeypatch.setattr(meshy, "STORAGE_DIR", tmp_path)

    calls = []
    monkeypatch.setattr(supabase_client, "insert_scan", lambda *a, **k: calls.append(1))

    response = client.post(
        "/api/generate",
        files={"images": ("test.png", sample_image_bytes, "image/png")},
    )
    job_id = response.json()["job_id"]
    _poll_until_done(client, job_id)

    assert calls == []


@respx.mock
def test_real_mode_job_completes_successfully(client, sample_image_bytes, monkeypatch, tmp_path):
    monkeypatch.setenv("MOCK_MESHY", "0")
    monkeypatch.setenv("MESHY_API_KEY", "test-key")
    monkeypatch.setattr(meshy, "STORAGE_DIR", tmp_path)

    task_id = "task-123"
    respx.post(f"{meshy.MESHY_API_BASE}/image-to-3d").mock(
        return_value=httpx.Response(200, json={"result": task_id})
    )
    respx.get(f"{meshy.MESHY_API_BASE}/image-to-3d/{task_id}").mock(
        return_value=httpx.Response(
            200,
            json={
                "status": "SUCCEEDED",
                "progress": 100,
                "model_urls": {"glb": "https://cdn.meshy.test/fake.glb"},
            },
        )
    )
    respx.get("https://cdn.meshy.test/fake.glb").mock(
        return_value=httpx.Response(200, content=b"fake-glb-bytes")
    )

    response = client.post(
        "/api/generate",
        files={"images": ("test.png", sample_image_bytes, "image/png")},
    )
    job_id = response.json()["job_id"]

    status = _poll_until_done(client, job_id)

    assert status["status"] == "succeeded"
    assert (tmp_path / f"{job_id}.glb").read_bytes() == b"fake-glb-bytes"


@respx.mock
def test_real_mode_job_fails_when_meshy_reports_failure(client, sample_image_bytes, monkeypatch, tmp_path):
    monkeypatch.setenv("MOCK_MESHY", "0")
    monkeypatch.setenv("MESHY_API_KEY", "test-key")
    monkeypatch.setattr(meshy, "STORAGE_DIR", tmp_path)

    task_id = "task-456"
    respx.post(f"{meshy.MESHY_API_BASE}/image-to-3d").mock(
        return_value=httpx.Response(200, json={"result": task_id})
    )
    respx.get(f"{meshy.MESHY_API_BASE}/image-to-3d/{task_id}").mock(
        return_value=httpx.Response(200, json={"status": "FAILED", "progress": 0})
    )

    response = client.post(
        "/api/generate",
        files={"images": ("test.png", sample_image_bytes, "image/png")},
    )
    job_id = response.json()["job_id"]

    status = _poll_until_done(client, job_id)

    assert status["status"] == "failed"
    assert status["error"]["error_code"] == "meshy_error"

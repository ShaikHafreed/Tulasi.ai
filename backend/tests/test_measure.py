from pathlib import Path

from app.services import meshy

FIXTURES_DIR = Path(__file__).parent / "fixtures"


def test_measure_not_found_for_unknown_job(client):
    response = client.post("/api/jobs/does-not-exist/measure")

    assert response.status_code == 404
    assert response.json()["error_code"] == "photo_not_found"


def test_measure_returns_calibration_for_uploaded_photo(client, monkeypatch, tmp_path):
    monkeypatch.setenv("MOCK_MESHY", "1")
    monkeypatch.setattr(meshy, "STORAGE_DIR", tmp_path)

    image_bytes = (FIXTURES_DIR / "card_and_object.png").read_bytes()
    response = client.post(
        "/api/generate",
        files={"image": ("card_and_object.png", image_bytes, "image/png")},
    )
    job_id = response.json()["job_id"]

    assert (tmp_path / f"{job_id}_photo.png").exists()

    measure_response = client.post(f"/api/jobs/{job_id}/measure")

    assert measure_response.status_code == 200
    body = measure_response.json()
    assert body["reference_detected"] is True
    assert body["reference_type"] == "card"


def test_measure_returns_502_for_corrupt_photo(client, monkeypatch, tmp_path):
    monkeypatch.setattr(meshy, "STORAGE_DIR", tmp_path)
    (tmp_path / "bad-job_photo.png").write_bytes(b"not a real image")

    response = client.post("/api/jobs/bad-job/measure")

    assert response.status_code == 502
    assert response.json()["error_code"] == "calibration_failed"

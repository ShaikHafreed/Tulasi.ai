def test_measure_rejects_unsupported_content_type(client, sample_image_bytes):
    response = client.post(
        "/api/measure",
        files={"image": ("test.txt", sample_image_bytes, "text/plain")},
    )

    assert response.status_code == 400
    assert response.json()["error_code"] == "unsupported_file_type"


def test_measure_returns_null_dimensions_when_no_reference(client, sample_image_bytes):
    response = client.post(
        "/api/measure",
        files={"image": ("test.png", sample_image_bytes, "image/png")},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["reference_type"] == "none"
    assert body["width_mm"] is None
    assert body["depth_estimated"] is True


def test_generate_job_record_includes_dimensions(client, sample_image_bytes, monkeypatch):
    monkeypatch.setenv("MOCK_MESHY", "1")

    response = client.post(
        "/api/generate",
        files={"images": ("test.png", sample_image_bytes, "image/png")},
    )
    job_id = response.json()["job_id"]

    status = client.get(f"/api/jobs/{job_id}")

    assert status.status_code == 200
    assert "dimensions" in status.json()

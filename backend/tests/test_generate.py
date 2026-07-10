def test_generate_rejects_unsupported_content_type(client, sample_image_bytes):
    response = client.post(
        "/api/generate",
        files={"image": ("test.txt", sample_image_bytes, "text/plain")},
    )

    assert response.status_code == 400
    assert response.json()["error_code"] == "unsupported_file_type"


def test_generate_accepts_image_and_returns_job_id(client, sample_image_bytes, monkeypatch):
    monkeypatch.setenv("MOCK_MESHY", "1")

    response = client.post(
        "/api/generate",
        files={"image": ("test.png", sample_image_bytes, "image/png")},
    )

    assert response.status_code == 202
    body = response.json()
    assert body["job_id"]

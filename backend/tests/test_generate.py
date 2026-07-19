def test_generate_rejects_unsupported_content_type(client, sample_image_bytes):
    response = client.post(
        "/api/generate",
        files={"images": ("test.txt", sample_image_bytes, "text/plain")},
    )

    assert response.status_code == 400
    assert response.json()["error_code"] == "unsupported_file_type"


def test_generate_accepts_image_and_returns_job_id(client, sample_image_bytes, monkeypatch):
    monkeypatch.setenv("MOCK_MESHY", "1")

    response = client.post(
        "/api/generate",
        files={"images": ("test.png", sample_image_bytes, "image/png")},
    )

    assert response.status_code == 202
    body = response.json()
    assert body["job_id"]


def test_generate_accepts_multiple_images(client, sample_image_bytes, monkeypatch):
    monkeypatch.setenv("MOCK_MESHY", "1")

    response = client.post(
        "/api/generate",
        files=[
            ("images", ("front.png", sample_image_bytes, "image/png")),
            ("images", ("side.png", sample_image_bytes, "image/png")),
            ("images", ("top.png", sample_image_bytes, "image/png")),
        ],
    )

    assert response.status_code == 202
    assert response.json()["job_id"]


def test_generate_rejects_more_than_four_images(client, sample_image_bytes):
    response = client.post(
        "/api/generate",
        files=[("images", (f"{i}.png", sample_image_bytes, "image/png")) for i in range(5)],
    )

    assert response.status_code == 400
    assert response.json()["error_code"] == "too_many_images"

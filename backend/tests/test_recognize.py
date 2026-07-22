def test_recognize_returns_objects_in_mock_mode(client, sample_image_bytes, monkeypatch):
    monkeypatch.setenv("MOCK_RECOGNIZE", "1")

    response = client.post(
        "/api/recognize",
        files={"image": ("test.png", sample_image_bytes, "image/png")},
    )

    assert response.status_code == 200
    body = response.json()
    assert len(body["objects"]) >= 1
    obj = body["objects"][0]
    # Mock never invents a label — it only guesses the box.
    assert obj["label"] is None
    assert set(obj["box"]) >= {"x", "y", "w", "h", "confident"}
    assert 0.0 <= obj["confidence"] <= 1.0


def test_recognize_rejects_unsupported_content_type(client, sample_image_bytes):
    response = client.post(
        "/api/recognize",
        files={"image": ("test.txt", sample_image_bytes, "text/plain")},
    )
    assert response.status_code == 400
    assert response.json()["error_code"] == "unsupported_file_type"

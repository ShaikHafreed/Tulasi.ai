def test_upload_thumbnail_requires_auth(client, sample_image_bytes):
    response = client.post(
        "/api/scans/some-job/thumbnail",
        files={"image": ("thumb.png", sample_image_bytes, "image/png")},
    )
    assert response.status_code == 401


def test_delete_scan_requires_auth(client):
    response = client.delete("/api/scans/some-job")
    assert response.status_code == 401


def test_upload_thumbnail_rejects_bad_content_type(client, sample_image_bytes):
    response = client.post(
        "/api/scans/some-job/thumbnail",
        files={"image": ("thumb.txt", sample_image_bytes, "text/plain")},
        headers={"Authorization": "Bearer fake-token"},
    )
    assert response.status_code == 400
    assert response.json()["error_code"] == "unsupported_file_type"

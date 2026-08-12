def test_upload_thumbnail_requires_auth(client, sample_image_bytes):
    response = client.post(
        "/api/scans/some-job/thumbnail",
        files={"image": ("thumb.png", sample_image_bytes, "image/png")},
    )
    assert response.status_code == 401


def test_delete_scan_requires_auth(client):
    response = client.delete("/api/scans/some-job")
    assert response.status_code == 401


def test_upload_thumbnail_rejects_bad_content_type(authed_client, sample_image_bytes):
    response = authed_client.post(
        "/api/scans/some-job/thumbnail",
        files={"image": ("thumb.txt", sample_image_bytes, "text/plain")},
    )
    assert response.status_code == 400
    assert response.json()["error_code"] == "unsupported_file_type"


def test_rename_scan_requires_auth(client):
    response = client.patch("/api/scans/some-job", json={"object_name": "Mug"})
    assert response.status_code == 401


def test_rename_scan_rejects_empty_name(authed_client):
    response = authed_client.patch(
        "/api/scans/some-job",
        json={"object_name": "   "},
    )
    assert response.status_code == 400
    assert response.json()["error_code"] == "invalid_name"


def test_upload_thumbnail_rejects_fake_bearer_token(client, sample_image_bytes, monkeypatch):
    # A syntactically-present bearer token that Supabase doesn't recognize as
    # real must still be rejected — this is the actual gap the new
    # get_current_user() dependency (app/auth.py) closes: the old code only
    # checked a token STRING was present, never that it was genuine.
    # verify_access_token is monkeypatched (rather than hitting real Supabase
    # over the network) to deterministically simulate "token doesn't verify".
    monkeypatch.setattr("app.supabase_client.verify_access_token", lambda token: None)
    response = client.post(
        "/api/scans/some-job/thumbnail",
        files={"image": ("thumb.png", sample_image_bytes, "image/png")},
        headers={"Authorization": "Bearer not-a-real-supabase-token"},
    )
    assert response.status_code == 401
    assert response.json()["error_code"] == "invalid_token"

def test_rig_rejects_job_without_meshy_task_id(client, sample_image_bytes, monkeypatch):
    monkeypatch.setenv("MOCK_MESHY", "1")

    response = client.post(
        "/api/generate",
        files={"image": ("test.png", sample_image_bytes, "image/png")},
    )
    job_id = response.json()["job_id"]

    rig_response = client.post("/api/character/rig", json={"job_id": job_id, "height_meters": 1.7})

    assert rig_response.status_code == 400
    assert rig_response.json()["error_code"] == "no_meshy_task"


def test_rig_rejects_unknown_job(client):
    response = client.post("/api/character/rig", json={"job_id": "does-not-exist", "height_meters": 1.7})
    assert response.status_code == 400


def test_get_rig_404_for_unknown_id(client):
    response = client.get("/api/character/rig/does-not-exist")
    assert response.status_code == 404


def test_animate_requires_ready_rig(client):
    response = client.post("/api/character/animate", json={"rig_id": "does-not-exist", "action_id": 0})
    assert response.status_code == 400
    assert response.json()["error_code"] == "rig_not_ready"


def test_list_presets_returns_real_action_ids(client):
    response = client.get("/api/character/presets")

    assert response.status_code == 200
    presets = response.json()
    assert len(presets) > 0
    assert all("action_id" in p and "label" in p for p in presets)

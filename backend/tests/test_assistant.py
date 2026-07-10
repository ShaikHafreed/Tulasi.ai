def test_assistant_asks_clarifying_question_when_target_size_missing(client, monkeypatch):
    monkeypatch.setenv("MOCK_ASSISTANT", "1")

    response = client.post("/api/assistant/message", json={"message": "make it bigger", "events": []})

    assert response.status_code == 200
    body = response.json()
    assert body["proposed_actions"] == []
    assert "?" in body["reply"]


def test_assistant_proposes_resize_when_target_and_context_present(client, monkeypatch):
    monkeypatch.setenv("MOCK_ASSISTANT", "1")

    events = [
        {
            "type": "reference_detected",
            "payload": {"width_mm": 100.0, "height_mm": 50.0, "depth_mm": 40.0},
            "at": 1,
        }
    ]
    response = client.post(
        "/api/assistant/message",
        json={"message": "make the width 120mm", "events": events},
    )

    assert response.status_code == 200
    body = response.json()
    assert len(body["proposed_actions"]) == 1
    action = body["proposed_actions"][0]
    assert action["action"] == "setDimensions"
    assert action["reversible"] is True
    assert action["params"]["width_mm"] == 120.0
    assert action["params"]["height_mm"] == 60.0  # scaled proportionally


def test_assistant_export_is_not_reversible(client, monkeypatch):
    monkeypatch.setenv("MOCK_ASSISTANT", "1")

    response = client.post("/api/assistant/message", json={"message": "export this as glb", "events": []})

    body = response.json()
    assert body["proposed_actions"][0]["action"] == "exportModel"
    assert body["proposed_actions"][0]["reversible"] is False


def test_assistant_summarizes_activity_on_request(client, monkeypatch):
    monkeypatch.setenv("MOCK_ASSISTANT", "1")

    events = [
        {"type": "scan_started", "payload": {}, "at": 1},
        {"type": "reference_detected", "payload": {"width_mm": 80.0}, "at": 2},
    ]
    response = client.post(
        "/api/assistant/message",
        json={"message": "what have i done so far?", "events": events},
    )

    body = response.json()
    assert "scan" in body["reply"].lower()
    assert body["proposed_actions"] == []


def test_assistant_live_observe_reacts_to_scan_started(client, monkeypatch):
    monkeypatch.setenv("MOCK_ASSISTANT", "1")

    response = client.post(
        "/api/assistant/message",
        json={"message": "__live_observe__:scan_started", "events": []},
    )

    body = response.json()
    assert body["reply"]
    assert body["proposed_actions"] == []


def test_assistant_live_observe_flags_missing_reference(client, monkeypatch):
    monkeypatch.setenv("MOCK_ASSISTANT", "1")

    events = [
        {
            "type": "reference_detected",
            "payload": {
                "reference_type": "none",
                "width_mm": None,
                "height_mm": None,
                "depth_mm": None,
            },
            "at": 1,
        }
    ]
    response = client.post(
        "/api/assistant/message",
        json={"message": "__live_observe__:reference_detected", "events": events},
    )

    body = response.json()
    assert "no card or coin" in body["reply"].lower()


def test_assistant_feedback_requires_auth(client):
    response = client.post("/api/assistant/feedback", json={"message": "hi", "rating": "up"})
    assert response.status_code == 401


def test_assistant_feedback_rejects_invalid_rating(client):
    response = client.post(
        "/api/assistant/feedback",
        json={"message": "hi", "rating": "sideways"},
        headers={"Authorization": "Bearer fake-token"},
    )
    assert response.status_code == 400

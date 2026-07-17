def test_assistant_answers_rigging_question_with_sources(client, monkeypatch):
    monkeypatch.setenv("MOCK_ASSISTANT", "1")

    response = client.post(
        "/api/assistant/message",
        json={"message": "why did rigging fail on my model?", "events": []},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["proposed_actions"] == []
    assert body["sources"]
    assert all(source["url"] for source in body["sources"])
    assert "humanoid" in body["reply"].lower() or "rig" in body["reply"].lower()


def test_assistant_action_intent_takes_priority_over_docs_lookup(client, monkeypatch):
    monkeypatch.setenv("MOCK_ASSISTANT", "1")

    # Mentions "glb" (a RAG trigger word) but is really an export command —
    # the existing action-intent branches must still win.
    response = client.post(
        "/api/assistant/message",
        json={"message": "export this as glb", "events": []},
    )

    body = response.json()
    assert body["proposed_actions"][0]["action"] == "exportModel"
    assert body["sources"] == []


def test_assistant_ordinary_resize_request_has_no_sources(client, monkeypatch):
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

    body = response.json()
    assert body["sources"] == []

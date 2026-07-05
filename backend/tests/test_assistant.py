import shutil
from pathlib import Path
from types import SimpleNamespace

from app import object_state
from app.services import assistant, meshy

FIXTURE_GLB = Path(__file__).parent.parent.parent / "experiments" / "fixtures" / "sample.glb"


def _text_response(text: str):
    return SimpleNamespace(
        stop_reason="end_turn",
        content=[SimpleNamespace(type="text", text=text)],
    )


def _tool_use_response(name: str, tool_input: dict, tool_use_id: str = "toolu_1"):
    return SimpleNamespace(
        stop_reason="tool_use",
        content=[SimpleNamespace(type="tool_use", name=name, input=tool_input, id=tool_use_id)],
    )


class FakeMessages:
    def __init__(self, responses: list):
        self._responses = list(responses)

    def create(self, **kwargs):
        return self._responses.pop(0)


class FakeClient:
    def __init__(self, responses: list):
        self.messages = FakeMessages(responses)


def test_ask_without_api_key_raises(monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)

    try:
        assistant.ask("job-1", "hello")
        assert False, "expected RuntimeError"
    except RuntimeError as exc:
        assert "ANTHROPIC_API_KEY" in str(exc)


def test_ask_explain_object_then_final_reply(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")
    fake_client = FakeClient(
        [
            _tool_use_response("explain_object", {}),
            _text_response("The object is 40mm wide."),
        ]
    )
    monkeypatch.setattr(assistant, "_client", lambda: fake_client)

    result = assistant.ask("job-explain", "what do you know about this object?")

    assert result["reply"] == "The object is 40mm wide."
    assert result["actions"] == []


def test_ask_set_dimensions_updates_object_state(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")
    fake_client = FakeClient(
        [
            _tool_use_response("set_dimensions", {"width_mm": 32}),
            _text_response("Resized to fit a 32mm pipe."),
        ]
    )
    monkeypatch.setattr(assistant, "_client", lambda: fake_client)

    result = assistant.ask("job-resize", "make this fit a 32mm pipe")

    assert result["reply"] == "Resized to fit a 32mm pipe."
    assert result["actions"] == [{"type": "set_dimensions", "payload": {"width_mm": 32}}]
    assert object_state.get("job-resize") == {"width_mm": 32}


def test_ask_run_print_check(monkeypatch, tmp_path):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")
    monkeypatch.setattr(meshy, "STORAGE_DIR", tmp_path)
    shutil.copyfile(FIXTURE_GLB, tmp_path / "job-print.glb")

    fake_client = FakeClient(
        [
            _tool_use_response("run_print_check", {}),
            _text_response("It should print fine."),
        ]
    )
    monkeypatch.setattr(assistant, "_client", lambda: fake_client)

    result = assistant.ask("job-print", "can I 3D print this?")

    assert result["reply"] == "It should print fine."
    assert result["actions"][0]["type"] == "print_check"
    assert "watertight" in result["actions"][0]["payload"]


def test_ask_export_model_glb(monkeypatch, tmp_path):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")
    monkeypatch.setattr(meshy, "STORAGE_DIR", tmp_path)
    shutil.copyfile(FIXTURE_GLB, tmp_path / "job-export.glb")

    fake_client = FakeClient(
        [
            _tool_use_response("export_model", {"format": "glb"}),
            _text_response("Here's the export."),
        ]
    )
    monkeypatch.setattr(assistant, "_client", lambda: fake_client)

    result = assistant.ask("job-export", "export this as glb")

    assert result["actions"][0] == {
        "type": "export_ready",
        "payload": {"format": "glb", "url": "/storage/job-export.glb"},
    }


def test_ask_stops_after_max_iterations(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")
    responses = [_tool_use_response("rotate_view", {"yaw_degrees": 10}) for _ in range(10)]
    fake_client = FakeClient(responses)
    monkeypatch.setattr(assistant, "_client", lambda: fake_client)

    result = assistant.ask("job-loop", "spin it around forever")

    assert result["reply"].startswith("I wasn't able to finish")
    assert len(result["actions"]) == assistant.MAX_TOOL_ITERATIONS


def test_assistant_endpoint_returns_502_without_key(client, monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)

    response = client.post("/api/jobs/some-job/assistant", json={"message": "hi"})

    assert response.status_code == 502
    assert response.json()["error_code"] == "assistant_unavailable"


def test_assistant_endpoint_returns_reply(client, monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")
    fake_client = FakeClient([_text_response("Hello there.")])
    monkeypatch.setattr(assistant, "_client", lambda: fake_client)

    response = client.post("/api/jobs/some-job/assistant", json={"message": "hi"})

    assert response.status_code == 200
    assert response.json() == {"reply": "Hello there.", "actions": []}

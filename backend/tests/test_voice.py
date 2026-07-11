def test_speak_returns_wav_audio_in_mock_mode(client, monkeypatch):
    monkeypatch.setenv("MOCK_VOICE", "1")
    monkeypatch.setattr("app.services.voice.consent_on_file", lambda: True)

    response = client.post("/api/voice/speak", json={"text": "hello"})

    assert response.status_code == 200
    assert response.headers["content-type"] == "audio/wav"
    assert response.content[:4] == b"RIFF"


def test_speak_requires_consent_on_file(client, monkeypatch):
    monkeypatch.setattr("app.services.voice.consent_on_file", lambda: False)

    response = client.post("/api/voice/speak", json={"text": "hello"})

    assert response.status_code == 403
    assert response.json()["error_code"] == "no_voice_consent"

"""Stage C: TTS in Hafreed's own cloned voice. This is the founder's fixed
voice for the assistant persona, not a per-user feature — consent is
recorded once in backend/voice/consent.json (gitignored, never committed).

Uses OpenVoice (MIT-licensed, self-hosted, free — see CLAUDE.md for why
XTTS-v2 was ruled out: its license is non-commercial only). Models and the
reference speaker embedding live in backend/voice/, gitignored since they're
derived from biometric data.

MOCK_VOICE=1 skips real model loading (slow on CPU, unnecessary for tests)
and returns a short silent WAV instead.
"""

import os
import struct
import threading
from pathlib import Path

VOICE_DIR = Path(__file__).resolve().parent.parent.parent.parent / "backend" / "voice"
CKPT_BASE = VOICE_DIR / "checkpoints_repo" / "checkpoints" / "base_speakers" / "EN"
CKPT_CONVERTER = VOICE_DIR / "checkpoints_repo" / "checkpoints" / "converter"
TARGET_SE_PATH = VOICE_DIR / "target_se.pth"
CONSENT_PATH = VOICE_DIR / "consent.json"

_lock = threading.Lock()
_base_tts = None
_tone_converter = None
_source_se = None
_target_se = None


def _mock_enabled() -> bool:
    return os.environ.get("MOCK_VOICE", "1") == "1"


def consent_on_file() -> bool:
    return CONSENT_PATH.exists()


def _silent_wav(seconds: float = 0.5, sample_rate: int = 16000) -> bytes:
    num_samples = int(seconds * sample_rate)
    data = b"\x00\x00" * num_samples
    header = struct.pack(
        "<4sI4s4sIHHIIHH4sI",
        b"RIFF",
        36 + len(data),
        b"WAVE",
        b"fmt ",
        16,
        1,
        1,
        sample_rate,
        sample_rate * 2,
        2,
        16,
        b"data",
        len(data),
    )
    return header + data


def _load_models() -> None:
    global _base_tts, _tone_converter, _source_se, _target_se
    if _base_tts is not None:
        return

    import torch
    from openvoice.api import BaseSpeakerTTS, ToneColorConverter

    if not TARGET_SE_PATH.exists():
        raise RuntimeError(
            "No cloned voice embedding on file — run backend/voice/clone_test.py "
            "(or the enrollment step) against a reference recording first."
        )

    base_tts = BaseSpeakerTTS(str(CKPT_BASE / "config.json"), device="cpu")
    base_tts.load_ckpt(str(CKPT_BASE / "checkpoint.pth"))

    tone_converter = ToneColorConverter(str(CKPT_CONVERTER / "config.json"), device="cpu")
    tone_converter.load_ckpt(str(CKPT_CONVERTER / "checkpoint.pth"))

    _source_se = torch.load(str(CKPT_BASE / "en_default_se.pth"), map_location="cpu")
    _target_se = torch.load(str(TARGET_SE_PATH), map_location="cpu")
    _base_tts = base_tts
    _tone_converter = tone_converter


def synthesize(text: str) -> bytes:
    if _mock_enabled():
        return _silent_wav()

    with _lock:
        _load_models()

    import tempfile

    with tempfile.TemporaryDirectory() as tmp:
        base_path = os.path.join(tmp, "base.wav")
        out_path = os.path.join(tmp, "out.wav")
        _base_tts.tts(text, base_path, speaker="default", language="English")
        _tone_converter.convert(
            audio_src_path=base_path,
            src_se=_source_se,
            tgt_se=_target_se,
            output_path=out_path,
        )
        return Path(out_path).read_bytes()

import base64
import json

from app.supabase_client import _decode_user_id


def _fake_jwt(payload: dict) -> str:
    def b64(data: dict) -> str:
        return base64.urlsafe_b64encode(json.dumps(data).encode()).decode().rstrip("=")

    header = b64({"alg": "HS256", "typ": "JWT"})
    body = b64(payload)
    return f"{header}.{body}.fake-signature"


def test_decode_user_id_reads_sub_claim():
    token = _fake_jwt({"sub": "user-123", "role": "authenticated"})

    assert _decode_user_id(token) == "user-123"

"""Security audit remediation tests for KPChat backend."""
import io
import os
import time
from datetime import datetime, timedelta, timezone

import jwt
import pytest
import requests

BASE_URL = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://chat-messenger-app-58.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

OLD_SECRET = "whatsapp_clone_super_secret_key_change_in_prod_9f8e7d6c5b4a"


def _unique_phone(suffix: int) -> str:
    # timestamp-based to avoid cooldown across test runs
    base = int(time.time()) % 10_000_000
    return f"+62812{base:07d}{suffix % 10}"[:16]


# -------- OTP register+verify helper (creates a new user, returns token+user) -------- #
def register_user(phone: str, name: str) -> dict:
    r = requests.post(f"{API}/auth/otp/request", json={"phone": phone, "purpose": "register", "name": name}, timeout=30)
    assert r.status_code == 200, f"otp/request failed: {r.status_code} {r.text}"
    dev = r.json().get("dev_code")
    assert dev, f"expected dev_code (ALLOW_DEV_OTP=true), got: {r.json()}"
    v = requests.post(f"{API}/auth/otp/verify", json={"phone": phone, "code": dev, "name": name}, timeout=30)
    assert v.status_code == 200, f"otp/verify failed: {v.status_code} {v.text}"
    return v.json()


@pytest.fixture(scope="module")
def user_a():
    phone = _unique_phone(1)
    return register_user(phone, "TEST_UserA")


@pytest.fixture(scope="module")
def user_b():
    # Different phone; wait to avoid cooldown against A's phone (different phones so ok).
    phone = _unique_phone(2)
    if phone == _unique_phone(1):
        phone = phone[:-1] + "3"
    return register_user(phone, "TEST_UserB")


def auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


# ----------------------------- SEC-001 ----------------------------- #
class TestSEC001OtpGating:
    def test_dev_code_returned_when_allow_dev_true(self):
        phone = _unique_phone(9)
        r = requests.post(f"{API}/auth/otp/request", json={"phone": phone, "purpose": "register", "name": "T"}, timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body.get("dev_code"), "dev_code must be present when ALLOW_DEV_OTP=true & Twilio unset"
        assert body["phone"].startswith("+")
        assert body.get("expires_in") == 300

    def test_gating_when_allow_dev_false(self, tmp_path):
        env_path = "/app/backend/.env"
        with open(env_path) as f:
            orig = f.read()
        try:
            new_env = orig.replace("ALLOW_DEV_OTP=true", "ALLOW_DEV_OTP=false")
            assert "ALLOW_DEV_OTP=false" in new_env
            with open(env_path, "w") as f:
                f.write(new_env)
            os.system("sudo supervisorctl restart backend >/dev/null 2>&1")
            # Wait for backend to come up
            for _ in range(30):
                try:
                    if requests.get(f"{API}/", timeout=3).status_code == 200:
                        break
                except Exception:
                    pass
                time.sleep(1)

            phone = _unique_phone(8)
            r = requests.post(f"{API}/auth/otp/request", json={"phone": phone, "purpose": "register", "name": "T"}, timeout=30)
            assert r.status_code == 503, f"expected 503, got {r.status_code} {r.text}"
            assert "SMS belum dikonfigurasi" in r.json().get("detail", "")
        finally:
            with open(env_path, "w") as f:
                f.write(orig)
            os.system("sudo supervisorctl restart backend >/dev/null 2>&1")
            for _ in range(30):
                try:
                    if requests.get(f"{API}/", timeout=3).status_code == 200:
                        break
                except Exception:
                    pass
                time.sleep(1)


# ----------------------------- SEC-002 ----------------------------- #
class TestSEC002JwtSecret:
    def test_env_has_strong_jwt_secret(self):
        with open("/app/backend/.env") as f:
            content = f.read()
        # 64 hex chars
        import re
        m = re.search(r"^JWT_SECRET\s*=\s*([A-Za-z0-9]+)", content, re.M)
        assert m, "JWT_SECRET missing"
        val = m.group(1).strip('"').strip("'")
        assert len(val) == 64, f"expected 64-char secret, got {len(val)}"
        assert all(c in "0123456789abcdefABCDEF" for c in val), "JWT_SECRET must be hex"
        assert val != OLD_SECRET
        assert "whatsapp_clone_super_secret" not in content


# ----------------------------- SEC-003 (BOLA files) ----------------------------- #
class TestSEC003FileAuthorization:
    def test_bola_file_and_chat_reference(self, user_a, user_b):
        token_a = user_a["access_token"]
        token_b = user_b["access_token"]
        uid_a = user_a["user"]["id"]
        uid_b = user_b["user"]["id"]

        # A uploads a small JPEG
        jpeg = b"\xff\xd8\xff\xe0" + b"\x00" * 200 + b"\xff\xd9"
        files = {"file": ("a.jpg", io.BytesIO(jpeg), "image/jpeg")}
        up = requests.post(f"{API}/upload", files=files, headers=auth_headers(token_a), timeout=30)
        assert up.status_code == 200, up.text
        path = up.json()["path"]

        # B tries to fetch → 403
        r = requests.get(f"{API}/files/{path}", params={"token": token_b}, timeout=30)
        assert r.status_code == 403, f"B should get 403, got {r.status_code}"

        # A fetches → 200
        r = requests.get(f"{API}/files/{path}", params={"token": token_a}, timeout=30)
        assert r.status_code == 200, r.text
        assert r.headers.get("X-Content-Type-Options") == "nosniff"
        assert r.headers.get("Content-Type", "").startswith("image/")

        # A creates chat with B, sends message with media_path
        c = requests.post(f"{API}/chats", json={"kind": "direct", "member_ids": [uid_b]}, headers=auth_headers(token_a), timeout=30)
        assert c.status_code == 200, c.text
        chat_id = c.json()["id"]
        m = requests.post(f"{API}/messages", json={"chat_id": chat_id, "media_path": path, "media_type": "image"},
                          headers=auth_headers(token_a), timeout=30)
        assert m.status_code == 200, m.text

        # Now B can view because it's referenced in a chat B belongs to
        r = requests.get(f"{API}/files/{path}", params={"token": token_b}, timeout=30)
        assert r.status_code == 200, f"B should now get 200 (chat member), got {r.status_code}: {r.text[:200]}"

    def test_avatar_public_ish(self, user_a, user_b):
        token_a = user_a["access_token"]
        token_b = user_b["access_token"]

        # A uploads a PNG for avatar
        png = b"\x89PNG\r\n\x1a\n" + b"\x00" * 200
        files = {"file": ("av.png", io.BytesIO(png), "image/png")}
        up = requests.post(f"{API}/upload", files=files, headers=auth_headers(token_a), timeout=30)
        assert up.status_code == 200
        path = up.json()["path"]

        # A sets avatar_path
        pm = requests.patch(f"{API}/auth/me", json={"avatar_path": path}, headers=auth_headers(token_a), timeout=30)
        assert pm.status_code == 200, pm.text
        assert pm.json().get("avatar_path") == path

        # B (any authenticated user) can fetch A's avatar → 200
        r = requests.get(f"{API}/files/{path}", params={"token": token_b}, timeout=30)
        assert r.status_code == 200, f"avatar should be viewable by any auth user, got {r.status_code}"


# ----------------------------- SEC-004 upload ----------------------------- #
class TestSEC004Uploads:
    def test_upload_size_cap_413(self, user_a):
        token_a = user_a["access_token"]
        big = b"\x00" * (25 * 1024 * 1024)
        files = {"file": ("big.jpg", io.BytesIO(big), "image/jpeg")}
        r = requests.post(f"{API}/upload", files=files, headers=auth_headers(token_a), timeout=120)
        assert r.status_code == 413, f"expected 413, got {r.status_code}"
        assert "melebihi 20 MB" in r.json().get("detail", "")

    def test_upload_small_ok(self, user_a):
        token_a = user_a["access_token"]
        small = b"\xff\xd8\xff\xe0" + b"\x00" * 2000 + b"\xff\xd9"
        files = {"file": ("s.jpg", io.BytesIO(small), "image/jpeg")}
        r = requests.post(f"{API}/upload", files=files, headers=auth_headers(token_a), timeout=30)
        assert r.status_code == 200, r.text

    def test_upload_type_blocked_text(self, user_a):
        token_a = user_a["access_token"]
        files = {"file": ("evil.html", io.BytesIO(b"<script>alert(1)</script>"), "text/html")}
        r = requests.post(f"{API}/upload", files=files, headers=auth_headers(token_a), timeout=30)
        assert r.status_code == 415, f"expected 415 got {r.status_code}: {r.text}"
        assert "Tipe berkas tidak diizinkan" in r.json().get("detail", "")

    def test_upload_type_blocked_plain(self, user_a):
        token_a = user_a["access_token"]
        files = {"file": ("a.txt", io.BytesIO(b"hello"), "text/plain")}
        r = requests.post(f"{API}/upload", files=files, headers=auth_headers(token_a), timeout=30)
        assert r.status_code == 415

    def test_upload_audio_ok(self, user_a):
        token_a = user_a["access_token"]
        files = {"file": ("a.m4a", io.BytesIO(b"\x00" * 500), "audio/mp4")}
        r = requests.post(f"{API}/upload", files=files, headers=auth_headers(token_a), timeout=30)
        assert r.status_code == 200, r.text


# ----------------------------- SEC-004 download safe headers ----------------------------- #
class TestSEC004DownloadHeaders:
    def test_nosniff_header_present(self, user_a):
        token_a = user_a["access_token"]
        jpeg = b"\xff\xd8\xff\xe0" + b"\x00" * 200 + b"\xff\xd9"
        files = {"file": ("a.jpg", io.BytesIO(jpeg), "image/jpeg")}
        up = requests.post(f"{API}/upload", files=files, headers=auth_headers(token_a), timeout=30)
        assert up.status_code == 200
        path = up.json()["path"]
        r = requests.get(f"{API}/files/{path}", params={"token": token_a}, timeout=30)
        assert r.status_code == 200
        assert r.headers.get("X-Content-Type-Options") == "nosniff"
        # Content-Type should be image/jpeg (safe inline)
        assert r.headers.get("Content-Type", "").startswith("image/")

    def test_path_traversal_blocked(self, user_a):
        token_a = user_a["access_token"]
        # /api/files/..%2Fetc%2Fpasswd — with percent-encoded slash the FastAPI path param decodes
        r = requests.get(f"{API}/files/..%2Fetc%2Fpasswd", params={"token": token_a}, timeout=30, allow_redirects=False)
        assert r.status_code in (400, 404), f"expected 400/404 got {r.status_code}"

        r2 = requests.get(f"{API}/files/foo/../bar", params={"token": token_a}, timeout=30, allow_redirects=False)
        assert r2.status_code in (400, 404), f"expected 400/404 got {r2.status_code}"


# ----------------------------- Message length cap ----------------------------- #
class TestMessageLengthCap:
    def test_message_5000_rejected(self, user_a, user_b):
        token_a = user_a["access_token"]
        uid_b = user_b["user"]["id"]
        c = requests.post(f"{API}/chats", json={"kind": "direct", "member_ids": [uid_b]}, headers=auth_headers(token_a), timeout=30)
        assert c.status_code == 200
        chat_id = c.json()["id"]
        r = requests.post(f"{API}/messages", json={"chat_id": chat_id, "text": "x" * 5000},
                          headers=auth_headers(token_a), timeout=30)
        assert r.status_code == 422, f"expected 422, got {r.status_code}"

    def test_message_4000_ok(self, user_a, user_b):
        token_a = user_a["access_token"]
        uid_b = user_b["user"]["id"]
        c = requests.post(f"{API}/chats", json={"kind": "direct", "member_ids": [uid_b]}, headers=auth_headers(token_a), timeout=30)
        chat_id = c.json()["id"]
        r = requests.post(f"{API}/messages", json={"chat_id": chat_id, "text": "y" * 4000},
                          headers=auth_headers(token_a), timeout=30)
        assert r.status_code == 200, r.text


# ----------------------------- Rate-limit + CORS regression ----------------------------- #
class TestRateLimitAndRoot:
    def test_root_status(self):
        r = requests.get(f"{API}/", timeout=15)
        assert r.status_code == 200
        b = r.json()
        assert b.get("status") == "ok"
        assert b.get("app") == "kpchat"
        assert b.get("mock_sms") is True

    def test_otp_cooldown_30s(self):
        phone = _unique_phone(7)
        r1 = requests.post(f"{API}/auth/otp/request", json={"phone": phone, "purpose": "register", "name": "T"}, timeout=15)
        assert r1.status_code == 200, r1.text
        r2 = requests.post(f"{API}/auth/otp/request", json={"phone": phone, "purpose": "register", "name": "T"}, timeout=15)
        assert r2.status_code == 429, f"expected 429 cooldown, got {r2.status_code}"
        assert "Tunggu 30 detik" in r2.json().get("detail", "")


# ----------------------------- JWT verification ----------------------------- #
class TestJWTVerification:
    def test_forged_token_with_old_secret_rejected(self, user_a):
        # Try forging a token with old placeholder secret
        payload = {
            "sub": user_a["user"]["id"],
            "iat": datetime.now(timezone.utc),
            "exp": datetime.now(timezone.utc) + timedelta(hours=1),
        }
        bad_token = jwt.encode(payload, OLD_SECRET, algorithm="HS256")
        r = requests.get(f"{API}/auth/me", headers=auth_headers(bad_token), timeout=15)
        assert r.status_code == 401, f"forged old-secret token must be 401, got {r.status_code}"

    def test_valid_token_accepted(self, user_a):
        r = requests.get(f"{API}/auth/me", headers=auth_headers(user_a["access_token"]), timeout=15)
        assert r.status_code == 200


# ----------------------------- Chat / message / reaction regression + WS ----------------------------- #
class TestChatFlowRegression:
    def test_end_to_end_message_and_reaction(self, user_a, user_b):
        token_a = user_a["access_token"]
        token_b = user_b["access_token"]
        uid_b = user_b["user"]["id"]

        c = requests.post(f"{API}/chats", json={"kind": "direct", "member_ids": [uid_b]}, headers=auth_headers(token_a), timeout=15)
        assert c.status_code == 200
        chat_id = c.json()["id"]

        # A sends text
        m = requests.post(f"{API}/messages", json={"chat_id": chat_id, "text": "hello from A"},
                          headers=auth_headers(token_a), timeout=15)
        assert m.status_code == 200
        msg_id = m.json()["id"]

        # B lists messages → receives
        lst = requests.get(f"{API}/chats/{chat_id}/messages", headers=auth_headers(token_b), timeout=15)
        assert lst.status_code == 200
        texts = [x["text"] for x in lst.json()]
        assert "hello from A" in texts

        # B reacts
        rr = requests.post(f"{API}/messages/{msg_id}/react", json={"emoji": "👍"},
                           headers=auth_headers(token_b), timeout=15)
        assert rr.status_code == 200
        reactions = rr.json().get("reactions", {})
        assert "👍" in reactions and uid_b in reactions["👍"]

    def test_websocket_delivery(self, user_a, user_b):
        import asyncio
        import websockets

        token_a = user_a["access_token"]
        token_b = user_b["access_token"]
        uid_b = user_b["user"]["id"]

        c = requests.post(f"{API}/chats", json={"kind": "direct", "member_ids": [uid_b]}, headers=auth_headers(token_a), timeout=15)
        chat_id = c.json()["id"]

        ws_base = BASE_URL.replace("https://", "wss://").replace("http://", "ws://")

        async def run():
            uri = f"{ws_base}/api/ws?token={token_b}"
            async with websockets.connect(uri, open_timeout=10) as ws:
                # send from A
                await asyncio.sleep(0.5)
                r = requests.post(
                    f"{API}/messages",
                    json={"chat_id": chat_id, "text": "ws-test-hello"},
                    headers=auth_headers(token_a),
                    timeout=15,
                )
                assert r.status_code == 200
                try:
                    raw = await asyncio.wait_for(ws.recv(), timeout=10)
                except asyncio.TimeoutError:
                    pytest.fail("WS did not receive broadcast within 10s")
                import json
                data = json.loads(raw)
                assert data.get("type") == "message"
                assert data.get("data", {}).get("text") == "ws-test-hello"

        asyncio.get_event_loop().run_until_complete(run()) if False else asyncio.run(run())

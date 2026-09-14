"""KPChat backend tests — phone + OTP mock auth, chats, messages, files."""
import os
import time
import uuid

import pytest
import requests

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"


def _phone():
    # Unique +62 phone per run (E.164, 8-15 digits after +)
    return "+628" + str(int(time.time() * 1000))[-11:]


def _request_otp(phone, purpose, name=None):
    payload = {"phone": phone, "purpose": purpose}
    if name is not None:
        payload["name"] = name
    return requests.post(f"{API}/auth/otp/request", json=payload, timeout=15)


def _verify(phone, code, name=None):
    payload = {"phone": phone, "code": code}
    if name is not None:
        payload["name"] = name
    return requests.post(f"{API}/auth/otp/verify", json=payload, timeout=15)


def _register_and_login(name="TEST_user"):
    p = _phone()
    r = _request_otp(p, "register", name)
    assert r.status_code == 200, r.text
    code = r.json()["dev_code"]
    v = _verify(p, code, name)
    assert v.status_code == 200, v.text
    return v.json(), p


def h(tok):
    return {"Authorization": f"Bearer {tok}"}


# ---------------- ROOT ---------------- #
def test_root_status():
    r = requests.get(f"{API}/", timeout=10)
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["app"] == "kpchat"
    assert body["mock_sms"] is True


# ---------------- OTP REQUEST ---------------- #
class TestOtpRequest:
    def test_register_ok_returns_dev_code(self):
        p = _phone()
        r = _request_otp(p, "register", "Andi")
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["phone"] == p
        assert body["expires_in"] == 300
        assert isinstance(body.get("dev_code"), str) and len(body["dev_code"]) == 6

    def test_register_conflict_when_already_registered(self):
        # first register + verify
        p = _phone()
        r = _request_otp(p, "register", "Andi")
        code = r.json()["dev_code"]
        assert _verify(p, code, "Andi").status_code == 200
        # wait past cooldown (30s) before requesting again
        time.sleep(31)
        r2 = _request_otp(p, "register", "Andi")
        assert r2.status_code == 409, r2.text

    def test_login_404_when_unregistered(self):
        p = _phone()
        r = _request_otp(p, "login")
        assert r.status_code == 404, r.text

    def test_cooldown_429(self):
        p = _phone()
        r1 = _request_otp(p, "register", "Cool")
        assert r1.status_code == 200
        r2 = _request_otp(p, "register", "Cool")
        assert r2.status_code == 429, r2.text

    def test_phone_normalization_spaced(self):
        suffix = str(int(time.time() * 1000))[-9:]
        raw = f"+62 8{suffix[0:3]} {suffix[3:6]} {suffix[6:9]}"
        expected = f"+628{suffix}"
        r = _request_otp(raw, "register", "Norm1")
        assert r.status_code == 200, r.text
        assert r.json()["phone"] == expected

    def test_phone_normalization_leading_zero(self):
        suffix = str(int(time.time() * 1000) + 1)[-9:]
        raw = f"628{suffix}"
        r = _request_otp(raw, "register", "Norm2")
        assert r.status_code == 200, r.text
        assert r.json()["phone"] == f"+628{suffix}"

    def test_malformed_phone_400(self):
        r = _request_otp("123", "register", "Bad")
        assert r.status_code == 400


# ---------------- OTP VERIFY ---------------- #
class TestOtpVerify:
    def test_wrong_code_400_then_success(self):
        p = _phone()
        r = _request_otp(p, "register", "V")
        code = r.json()["dev_code"]
        # wrong first
        bad = _verify(p, "000000" if code != "000000" else "111111", "V")
        assert bad.status_code == 400
        # correct
        ok = _verify(p, code, "V")
        assert ok.status_code == 200
        body = ok.json()
        assert "access_token" in body
        u = body["user"]
        for k in ("id", "phone", "name", "about", "avatar_path", "online", "last_seen"):
            assert k in u
        assert u["phone"] == p
        assert u["name"] == "V"

    def test_otp_single_use(self):
        p = _phone()
        r = _request_otp(p, "register", "One")
        code = r.json()["dev_code"]
        assert _verify(p, code, "One").status_code == 200
        # second verify with same code should fail
        again = _verify(p, code, "One")
        assert again.status_code == 400

    def test_five_wrong_codes_429(self):
        p = _phone()
        r = _request_otp(p, "register", "Lock")
        real = r.json()["dev_code"]
        wrong = "999999" if real != "999999" else "000000"
        for _ in range(5):
            resp = _verify(p, wrong, "Lock")
            assert resp.status_code == 400
        # 6th attempt should be rate-limited
        resp = _verify(p, wrong, "Lock")
        assert resp.status_code == 429


# ---------------- ME ---------------- #
class TestMe:
    def test_me_returns_phone_not_email(self):
        tok, p = _register_and_login("Me1")
        r = requests.get(f"{API}/auth/me", headers=h(tok["access_token"]))
        assert r.status_code == 200
        body = r.json()
        assert body["phone"] == p
        assert "email" not in body

    def test_patch_me_updates_name_about(self):
        tok, _ = _register_and_login("Me2")
        new_about = f"about-{uuid.uuid4().hex[:6]}"
        r = requests.patch(
            f"{API}/auth/me",
            json={"name": "Me2Updated", "about": new_about},
            headers=h(tok["access_token"]),
        )
        assert r.status_code == 200
        assert r.json()["about"] == new_about
        assert r.json()["name"] == "Me2Updated"
        # GET verifies persistence
        me = requests.get(f"{API}/auth/me", headers=h(tok["access_token"]))
        assert me.json()["about"] == new_about
        assert me.json()["name"] == "Me2Updated"


# ---------------- CHATS + MESSAGES ---------------- #
class TestChatFlow:
    def test_direct_chat_and_message(self):
        a, _ = _register_and_login("Alice")
        b, _ = _register_and_login("Bob")
        r = requests.post(
            f"{API}/chats",
            json={"kind": "direct", "member_ids": [b["user"]["id"]]},
            headers=h(a["access_token"]),
        )
        assert r.status_code == 200
        chat_id = r.json()["id"]
        # message
        m = requests.post(
            f"{API}/messages",
            json={"chat_id": chat_id, "text": "TEST_hello"},
            headers=h(a["access_token"]),
        )
        assert m.status_code == 200
        assert m.json()["text"] == "TEST_hello"
        # list from B's view
        lst = requests.get(f"{API}/chats/{chat_id}/messages", headers=h(b["access_token"]))
        assert lst.status_code == 200
        assert any(msg["text"] == "TEST_hello" for msg in lst.json())

"""Backend tests for reply/react/audio features (iteration 2).

Auth was migrated from email+password to phone+OTP (see commit "Rebrand Biru &
Auth Nomor + OTP"), so the fixtures below register throwaway accounts through
``/auth/otp/request`` + ``/auth/otp/verify`` instead of the removed
``/auth/login`` endpoint. Each run uses timestamp-derived phone numbers so the
per-phone OTP cooldown never kicks in.
"""
import io
import os
import time
import uuid

import pytest
import requests

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"


def _unique_phone(offset: int) -> str:
    return f"+1555{int(time.time()) % 10_000_000:07d}{offset}"


def _register(name: str, offset: int) -> dict:
    """Create a fresh account via the phone+OTP flow and return the auth payload."""
    phone = _unique_phone(offset)
    r = requests.post(
        f"{API}/auth/otp/request",
        json={"phone": phone, "purpose": "register", "name": name},
        timeout=30,
    )
    assert r.status_code == 200, r.text
    dev_code = r.json().get("dev_code")
    assert dev_code, "ALLOW_DEV_OTP must be true (or Twilio configured) to run this suite"

    r = requests.post(
        f"{API}/auth/otp/verify",
        json={"phone": phone, "code": dev_code, "purpose": "register", "name": name},
        timeout=30,
    )
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="module")
def alice():
    return _register("Alice", 1)


@pytest.fixture(scope="module")
def bob():
    return _register("Bob", 2)


def _h(tok: dict) -> dict:
    return {"Authorization": f"Bearer {tok['access_token']}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def direct_chat(alice, bob):
    r = requests.post(
        f"{API}/chats",
        headers=_h(alice),
        json={"kind": "direct", "member_ids": [bob["user"]["id"]]},
        timeout=30,
    )
    assert r.status_code == 200, r.text
    return r.json()


# ---------------- messages: reply ---------------- #
class TestReply:
    def test_send_and_reply_embeds_preview(self, alice, bob, direct_chat):
        r1 = requests.post(
            f"{API}/messages",
            headers=_h(alice),
            json={"chat_id": direct_chat["id"], "text": "TEST_parent_hello"},
            timeout=30,
        )
        assert r1.status_code == 200, r1.text
        parent = r1.json()
        assert parent["reply_to"] is None
        assert parent["reactions"] == {}

        r2 = requests.post(
            f"{API}/messages",
            headers=_h(bob),
            json={"chat_id": direct_chat["id"], "text": "TEST_reply_yo", "reply_to_id": parent["id"]},
            timeout=30,
        )
        assert r2.status_code == 200, r2.text
        reply = r2.json()
        assert reply["reply_to"] is not None
        assert reply["reply_to"]["id"] == parent["id"]
        assert reply["reply_to"]["sender_id"] == parent["sender_id"]
        assert reply["reply_to"]["text"] == "TEST_parent_hello"

        # GET messages verifies persistence of reply_to
        r3 = requests.get(f"{API}/chats/{direct_chat['id']}/messages", headers=_h(alice), timeout=30)
        assert r3.status_code == 200
        msgs = r3.json()
        found = next((m for m in msgs if m["id"] == reply["id"]), None)
        assert found is not None
        assert found["reply_to"]["id"] == parent["id"]
        assert found["reply_to"]["text"] == "TEST_parent_hello"


# ---------------- messages: react ---------------- #
class TestReact:
    def _new_msg(self, alice, chat_id):
        r = requests.post(
            f"{API}/messages",
            headers=_h(alice),
            json={"chat_id": chat_id, "text": "TEST_react_target"},
            timeout=30,
        )
        assert r.status_code == 200
        return r.json()

    def test_add_toggle_switch_reaction(self, alice, bob, direct_chat):
        msg = self._new_msg(alice, direct_chat["id"])
        mid = msg["id"]
        uid = bob["user"]["id"]

        # add ❤️
        r = requests.post(f"{API}/messages/{mid}/react", headers=_h(bob), json={"emoji": "❤️"}, timeout=30)
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["reactions"].get("❤️") == [uid]

        # switch to 👍 (one-per-user)
        r2 = requests.post(f"{API}/messages/{mid}/react", headers=_h(bob), json={"emoji": "👍"}, timeout=30)
        assert r2.status_code == 200
        rx = r2.json()["reactions"]
        assert "❤️" not in rx, "old reaction should be removed"
        assert rx.get("👍") == [uid]

        # toggle 👍 OFF
        r3 = requests.post(f"{API}/messages/{mid}/react", headers=_h(bob), json={"emoji": "👍"}, timeout=30)
        assert r3.status_code == 200
        assert r3.json()["reactions"] == {}, "toggle same emoji should remove reaction"

        # verify persistence via GET
        r4 = requests.get(f"{API}/chats/{direct_chat['id']}/messages", headers=_h(alice), timeout=30)
        assert r4.status_code == 200
        got = next(m for m in r4.json() if m["id"] == mid)
        assert got["reactions"] == {}

    def test_react_returns_message_out(self, alice, bob, direct_chat):
        msg = self._new_msg(alice, direct_chat["id"])
        r = requests.post(
            f"{API}/messages/{msg['id']}/react",
            headers=_h(alice),
            json={"emoji": "😂"},
            timeout=30,
        )
        assert r.status_code == 200
        body = r.json()
        # returned MessageOut shape
        for key in ("id", "chat_id", "sender_id", "text", "reactions", "read_by", "created_at"):
            assert key in body
        assert body["id"] == msg["id"]
        assert body["reactions"] == {"😂": [alice["user"]["id"]]}

    def test_react_on_missing_message_404(self, alice):
        r = requests.post(
            f"{API}/messages/nonexistent-id/react",
            headers=_h(alice),
            json={"emoji": "❤️"},
            timeout=30,
        )
        assert r.status_code == 404


# ---------------- audio message + upload/download ---------------- #
class TestAudio:
    def test_upload_audio_and_send(self, alice, direct_chat):
        # Fake m4a bytes (server does not decode)
        payload = b"\x00\x00\x00\x20ftypM4A " + os.urandom(64)
        files = {"file": ("voice.m4a", io.BytesIO(payload), "audio/m4a")}
        r = requests.post(
            f"{API}/upload",
            headers={"Authorization": f"Bearer {alice['access_token']}"},
            files=files,
            timeout=60,
        )
        assert r.status_code == 200, r.text
        up = r.json()
        assert "path" in up

        # send audio message
        r2 = requests.post(
            f"{API}/messages",
            headers=_h(alice),
            json={
                "chat_id": direct_chat["id"],
                "media_path": up["path"],
                "media_type": "audio",
                "audio_duration_ms": 3200,
            },
            timeout=30,
        )
        assert r2.status_code == 200, r2.text
        m = r2.json()
        assert m["media_type"] == "audio"
        assert m["media_path"] == up["path"]
        assert m["audio_duration_ms"] == 3200

        # GET file via token query
        url = f"{API}/files/{up['path']}?token={alice['access_token']}"
        r3 = requests.get(url, timeout=60)
        assert r3.status_code == 200
        assert len(r3.content) == len(payload)

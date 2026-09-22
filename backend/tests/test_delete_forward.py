"""Backend tests for Delete-for-Everyone and Forward Message features (iteration 7)."""

import asyncio
import json
import os
import time
import uuid

import pytest
import requests
import websockets

BASE_URL = os.environ["EXPO_PUBLIC_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"
WS_URL = BASE_URL.replace("https://", "wss://").replace("http://", "ws://") + "/api/ws"


# --------------------------- helpers --------------------------- #
import random

_BASE_TS = int(time.time() * 1000) + random.randint(0, 999)


def _phone(suffix: str) -> str:
    # Unique per-run digits-only phone; +62 + 10 digits satisfies E.164 min length.
    d = str(ord(suffix) % 10)
    return f"+628{(_BASE_TS % 1000000000):09d}{d}"


def _register(name: str, phone: str) -> dict:
    r = requests.post(f"{API}/auth/otp/request", json={"phone": phone, "purpose": "register", "name": name}, timeout=15)
    assert r.status_code == 200, r.text
    code = r.json()["dev_code"]
    assert code
    v = requests.post(f"{API}/auth/otp/verify", json={"phone": phone, "code": code, "name": name}, timeout=15)
    assert v.status_code == 200, v.text
    return v.json()  # {access_token, user}


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="module")
def users():
    a = _register("TEST_Alice", _phone("A"))
    b = _register("TEST_Bob", _phone("B"))
    c = _register("TEST_Carol", _phone("C"))
    return {"a": a, "b": b, "c": c}


@pytest.fixture(scope="module")
def direct_chat(users):
    r = requests.post(
        f"{API}/chats",
        json={"kind": "direct", "member_ids": [users["b"]["user"]["id"]]},
        headers=_auth(users["a"]["access_token"]),
        timeout=15,
    )
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="module")
def other_direct_chat(users):
    r = requests.post(
        f"{API}/chats",
        json={"kind": "direct", "member_ids": [users["c"]["user"]["id"]]},
        headers=_auth(users["a"]["access_token"]),
        timeout=15,
    )
    assert r.status_code == 200, r.text
    return r.json()


def _send(token: str, chat_id: str, text: str = "hello") -> dict:
    r = requests.post(
        f"{API}/messages",
        json={"chat_id": chat_id, "text": text},
        headers=_auth(token),
        timeout=15,
    )
    assert r.status_code == 200, r.text
    return r.json()


# =========================== DELETE =========================== #
class TestDelete:
    def test_delete_success_soft_deletes_and_clears_content(self, users, direct_chat):
        msg = _send(users["a"]["access_token"], direct_chat["id"], "to-delete")
        assert msg["is_deleted"] is False
        r = requests.delete(f"{API}/messages/{msg['id']}", headers=_auth(users["a"]["access_token"]), timeout=15)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["is_deleted"] is True
        assert data["text"] is None
        assert data["media_path"] is None
        assert data["media_type"] is None
        assert data["reply_to"] is None
        assert data["reactions"] == {}

        # GET messages: still present, is_deleted=true, no content.
        g = requests.get(f"{API}/chats/{direct_chat['id']}/messages", headers=_auth(users["b"]["access_token"]), timeout=15)
        assert g.status_code == 200
        matched = [m for m in g.json() if m["id"] == msg["id"]]
        assert len(matched) == 1
        assert matched[0]["is_deleted"] is True
        assert matched[0]["text"] is None

    def test_delete_by_non_sender_forbidden(self, users, direct_chat):
        msg = _send(users["a"]["access_token"], direct_chat["id"], "keep")
        r = requests.delete(f"{API}/messages/{msg['id']}", headers=_auth(users["b"]["access_token"]), timeout=15)
        assert r.status_code == 403, r.text
        assert "pengirim" in r.json()["detail"].lower()

    def test_delete_by_non_member_404(self, users, direct_chat):
        msg = _send(users["a"]["access_token"], direct_chat["id"], "priv")
        r = requests.delete(f"{API}/messages/{msg['id']}", headers=_auth(users["c"]["access_token"]), timeout=15)
        assert r.status_code == 404, r.text

    def test_delete_already_deleted_returns_400(self, users, direct_chat):
        msg = _send(users["a"]["access_token"], direct_chat["id"], "dbl")
        requests.delete(f"{API}/messages/{msg['id']}", headers=_auth(users["a"]["access_token"]), timeout=15)
        r2 = requests.delete(f"{API}/messages/{msg['id']}", headers=_auth(users["a"]["access_token"]), timeout=15)
        assert r2.status_code == 400, r2.text
        assert "sudah" in r2.json()["detail"].lower()

    def test_delete_older_than_window_returns_400(self, users, direct_chat):
        """Backdate a message via direct DB access to simulate age > 5 min."""
        import datetime as dt
        from pymongo import MongoClient

        msg = _send(users["a"]["access_token"], direct_chat["id"], "old-msg")
        with MongoClient(os.environ["MONGO_URL"]) as mc:
            mc[os.environ["DB_NAME"]].messages.update_one(
                {"id": msg["id"]},
                {"$set": {"created_at": dt.datetime.now(dt.timezone.utc) - dt.timedelta(minutes=6)}},
            )
        r = requests.delete(f"{API}/messages/{msg['id']}", headers=_auth(users["a"]["access_token"]), timeout=15)
        assert r.status_code == 400, r.text
        assert "5 menit" in r.json()["detail"]

    def test_chats_last_message_reflects_deletion(self, users):
        """When newest msg is deleted, /chats returns last_message.is_deleted=true and text=null."""
        # Fresh direct chat between A and B to isolate 'newest' state.
        r = requests.post(
            f"{API}/chats",
            json={"kind": "direct", "member_ids": [users["b"]["user"]["id"]]},
            headers=_auth(users["a"]["access_token"]),
        )
        assert r.status_code == 200
        chat_id = r.json()["id"]
        msg = _send(users["a"]["access_token"], chat_id, "last-msg-to-delete")
        d = requests.delete(f"{API}/messages/{msg['id']}", headers=_auth(users["a"]["access_token"]))
        assert d.status_code == 200
        lst = requests.get(f"{API}/chats", headers=_auth(users["a"]["access_token"])).json()
        this_chat = next(c for c in lst if c["id"] == chat_id)
        assert this_chat["last_message"] is not None
        assert this_chat["last_message"]["is_deleted"] is True
        assert this_chat["last_message"]["text"] is None
        assert this_chat["last_message"]["media_type"] is None

    def test_delete_broadcasts_ws_event(self, users, direct_chat):
        """A deletes; B (connected via WS) should receive payload with _event='deleted'."""
        msg = _send(users["a"]["access_token"], direct_chat["id"], "ws-del")

        async def run():
            got = None
            async with websockets.connect(f"{WS_URL}?token={users['b']['access_token']}") as ws:
                # Trigger delete AFTER connection is open.
                await asyncio.sleep(0.3)
                r = await asyncio.get_event_loop().run_in_executor(
                    None,
                    lambda: requests.delete(
                        f"{API}/messages/{msg['id']}", headers=_auth(users["a"]["access_token"])
                    ),
                )
                assert r.status_code == 200
                # Read a few frames.
                for _ in range(5):
                    frame = await asyncio.wait_for(ws.recv(), timeout=5)
                    p = json.loads(frame)
                    if p.get("type") == "message" and p.get("data", {}).get("_event") == "deleted":
                        got = p["data"]
                        break
            return got

        payload = asyncio.new_event_loop().run_until_complete(run())
        assert payload is not None, "no 'deleted' WS event received"
        assert payload["id"] == msg["id"]
        assert payload["is_deleted"] is True
        assert payload["text"] is None


# =========================== FORWARD =========================== #
class TestForward:
    def test_forward_text_message_preserves_content(self, users, direct_chat, other_direct_chat):
        src = _send(users["a"]["access_token"], direct_chat["id"], "forward-me")
        r = requests.post(
            f"{API}/messages/{src['id']}/forward",
            json={"chat_ids": [other_direct_chat["id"]]},
            headers=_auth(users["a"]["access_token"]),
        )
        assert r.status_code == 200, r.text
        arr = r.json()
        assert len(arr) == 1
        new_msg = arr[0]
        assert new_msg["forwarded"] is True
        assert new_msg["text"] == "forward-me"
        assert new_msg["chat_id"] == other_direct_chat["id"]
        assert new_msg["reply_to"] is None
        assert new_msg["reactions"] == {}
        assert new_msg["read_by"] == [users["a"]["user"]["id"]]

    def test_cannot_forward_deleted_message(self, users, direct_chat, other_direct_chat):
        msg = _send(users["a"]["access_token"], direct_chat["id"], "del-then-fwd")
        requests.delete(f"{API}/messages/{msg['id']}", headers=_auth(users["a"]["access_token"]))
        r = requests.post(
            f"{API}/messages/{msg['id']}/forward",
            json={"chat_ids": [other_direct_chat["id"]]},
            headers=_auth(users["a"]["access_token"]),
        )
        assert r.status_code == 400, r.text
        assert "dihapus" in r.json()["detail"].lower()

    def test_forward_non_member_of_source_403(self, users, direct_chat, other_direct_chat):
        # C is not a member of direct_chat (A<->B) but is member of other_direct_chat (A<->C).
        src = _send(users["a"]["access_token"], direct_chat["id"], "secret")
        r = requests.post(
            f"{API}/messages/{src['id']}/forward",
            json={"chat_ids": [other_direct_chat["id"]]},
            headers=_auth(users["c"]["access_token"]),
        )
        assert r.status_code == 403, r.text

    def test_forward_all_invalid_targets_404(self, users, direct_chat):
        src = _send(users["a"]["access_token"], direct_chat["id"], "orphan-fwd")
        bogus = str(uuid.uuid4())
        r = requests.post(
            f"{API}/messages/{src['id']}/forward",
            json={"chat_ids": [bogus]},
            headers=_auth(users["a"]["access_token"]),
        )
        assert r.status_code == 404, r.text

    def test_forward_filters_non_member_targets(self, users, direct_chat):
        """When a chat_id list mixes valid + non-member, only valid ones create messages."""
        # B<->C chat that A is NOT a member of.
        rbc = requests.post(
            f"{API}/chats",
            json={"kind": "direct", "member_ids": [users["c"]["user"]["id"]]},
            headers=_auth(users["b"]["access_token"]),
        )
        bc_chat_id = rbc.json()["id"]
        # A's own second chat (A<->C) as valid target.
        rac = requests.post(
            f"{API}/chats",
            json={"kind": "direct", "member_ids": [users["c"]["user"]["id"]]},
            headers=_auth(users["a"]["access_token"]),
        )
        ac_chat_id = rac.json()["id"]
        src = _send(users["a"]["access_token"], direct_chat["id"], "filter-fwd")
        r = requests.post(
            f"{API}/messages/{src['id']}/forward",
            json={"chat_ids": [bc_chat_id, ac_chat_id]},
            headers=_auth(users["a"]["access_token"]),
        )
        assert r.status_code == 200, r.text
        arr = r.json()
        assert len(arr) == 1
        assert arr[0]["chat_id"] == ac_chat_id
        assert arr[0]["forwarded"] is True

    def test_forward_ignores_reactions_and_reply(self, users, direct_chat, other_direct_chat):
        """React/reply on source; forwarded copy must not carry them."""
        src = _send(users["a"]["access_token"], direct_chat["id"], "with-react")
        reply = requests.post(
            f"{API}/messages",
            json={"chat_id": direct_chat["id"], "text": "child", "reply_to_id": src["id"]},
            headers=_auth(users["a"]["access_token"]),
        ).json()
        requests.post(
            f"{API}/messages/{reply['id']}/react",
            json={"emoji": "👍"},
            headers=_auth(users["b"]["access_token"]),
        )
        r = requests.post(
            f"{API}/messages/{reply['id']}/forward",
            json={"chat_ids": [other_direct_chat["id"]]},
            headers=_auth(users["a"]["access_token"]),
        )
        assert r.status_code == 200
        new_msg = r.json()[0]
        assert new_msg["reactions"] == {}
        assert new_msg["reply_to"] is None
        assert new_msg["forwarded"] is True

    def test_forward_broadcasts_ws_to_target_members(self, users, direct_chat, other_direct_chat):
        """C should receive WS message frame when A forwards into A<->C chat."""
        src = _send(users["a"]["access_token"], direct_chat["id"], "ws-fwd")

        async def run():
            payload = None
            async with websockets.connect(f"{WS_URL}?token={users['c']['access_token']}") as ws:
                await asyncio.sleep(0.3)
                r = await asyncio.get_event_loop().run_in_executor(
                    None,
                    lambda: requests.post(
                        f"{API}/messages/{src['id']}/forward",
                        json={"chat_ids": [other_direct_chat["id"]]},
                        headers=_auth(users["a"]["access_token"]),
                    ),
                )
                assert r.status_code == 200
                for _ in range(5):
                    frame = await asyncio.wait_for(ws.recv(), timeout=5)
                    p = json.loads(frame)
                    if p.get("type") == "message" and p.get("data", {}).get("forwarded") is True:
                        payload = p["data"]
                        break
            return payload

        p = asyncio.new_event_loop().run_until_complete(run())
        assert p is not None, "no forwarded WS frame received"
        assert p["chat_id"] == other_direct_chat["id"]
        assert p["forwarded"] is True


# =========================== REGRESSION =========================== #
class TestRegression:
    def test_send_message_defaults(self, users, direct_chat):
        msg = _send(users["a"]["access_token"], direct_chat["id"], "regression")
        assert msg["is_deleted"] is False
        assert msg["forwarded"] is False
        assert msg["reactions"] == {}

    def test_react_still_works(self, users, direct_chat):
        msg = _send(users["a"]["access_token"], direct_chat["id"], "react-me")
        r = requests.post(
            f"{API}/messages/{msg['id']}/react",
            json={"emoji": "❤️"},
            headers=_auth(users["b"]["access_token"]),
        )
        assert r.status_code == 200
        assert "❤️" in r.json()["reactions"]
        assert users["b"]["user"]["id"] in r.json()["reactions"]["❤️"]

    def test_reply_still_works(self, users, direct_chat):
        parent = _send(users["a"]["access_token"], direct_chat["id"], "parent")
        r = requests.post(
            f"{API}/messages",
            json={"chat_id": direct_chat["id"], "text": "child", "reply_to_id": parent["id"]},
            headers=_auth(users["a"]["access_token"]),
        )
        assert r.status_code == 200
        assert r.json()["reply_to"]["id"] == parent["id"]
        assert r.json()["is_deleted"] is False
        assert r.json()["forwarded"] is False

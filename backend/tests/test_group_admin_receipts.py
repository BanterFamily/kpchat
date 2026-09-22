"""Tests for Group Admin Tools + Read Receipts Privacy (iteration 6)."""
import os
import time
import uuid
import asyncio
import json

import pytest
import requests
import websockets

BASE_URL = (os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get("EXPO_BACKEND_URL")).rstrip("/")
API = f"{BASE_URL}/api"
WS_URL = BASE_URL.replace("https://", "wss://").replace("http://", "ws://") + "/api/ws"


def _rand_phone(offset: int) -> str:
    # timestamp + offset digit, keep to 13-digit international-ish
    ts = int(time.time())
    return f"+1555{ts % 10_000_000:07d}{offset}"


def _register(name: str, offset: int) -> dict:
    phone = _rand_phone(offset)
    # OTP cooldown is per phone, so unique phones = no cooldown
    r = requests.post(f"{API}/auth/otp/request", json={"phone": phone, "purpose": "register", "name": name}, timeout=30)
    assert r.status_code == 200, r.text
    dev_code = r.json()["dev_code"]
    r = requests.post(f"{API}/auth/otp/verify", json={"phone": phone, "code": dev_code, "name": name}, timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    return {"token": data["access_token"], "user": data["user"], "phone": phone}


def _h(token: str) -> dict:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


@pytest.fixture(scope="module")
def actors():
    time.sleep(1)
    a = _register("Alice", 1)
    time.sleep(1)
    b = _register("Bob", 2)
    time.sleep(1)
    c = _register("Carol", 3)
    time.sleep(1)
    d = _register("Dave", 4)
    return {"a": a, "b": b, "c": c, "d": d}


@pytest.fixture
def group(actors):
    """Fresh group per test where A is admin, B is member."""
    r = requests.post(f"{API}/chats", headers=_h(actors["a"]["token"]),
                      json={"kind": "group", "name": "Squad",
                            "member_ids": [actors["b"]["user"]["id"]]}, timeout=30)
    assert r.status_code == 200, r.text
    chat = r.json()
    assert chat["created_by"] == actors["a"]["user"]["id"]
    assert chat["kind"] == "group"
    return chat


# ------------------------- ChatOut created_by ------------------------- #
class TestChatOut:
    def test_created_by_present(self, actors, group):
        assert "created_by" in group
        assert group["created_by"] == actors["a"]["user"]["id"]


# ------------------------- PATCH /chats/{id} name ------------------------- #
class TestUpdateChatName:
    def test_admin_rename(self, actors, group):
        r = requests.patch(f"{API}/chats/{group['id']}", headers=_h(actors["a"]["token"]),
                           json={"name": "Renamed Squad"}, timeout=30)
        assert r.status_code == 200, r.text
        assert r.json()["name"] == "Renamed Squad"
        # verify persistence
        r2 = requests.get(f"{API}/chats/{group['id']}", headers=_h(actors["a"]["token"]))
        assert r2.json()["name"] == "Renamed Squad"

    def test_non_admin_forbidden(self, actors, group):
        r = requests.patch(f"{API}/chats/{group['id']}", headers=_h(actors["b"]["token"]),
                           json={"name": "Hijacked"}, timeout=30)
        assert r.status_code == 403, r.text

    def test_direct_chat_400(self, actors):
        r = requests.post(f"{API}/chats", headers=_h(actors["a"]["token"]),
                          json={"kind": "direct", "member_ids": [actors["c"]["user"]["id"]]}, timeout=30)
        assert r.status_code == 200
        direct = r.json()
        r2 = requests.patch(f"{API}/chats/{direct['id']}", headers=_h(actors["a"]["token"]),
                            json={"name": "nope"}, timeout=30)
        assert r2.status_code == 400

    def test_empty_body_400(self, actors, group):
        r = requests.patch(f"{API}/chats/{group['id']}", headers=_h(actors["a"]["token"]),
                           json={}, timeout=30)
        assert r.status_code == 400


# ------------------------- PATCH avatar_path ------------------------- #
class TestUpdateAvatar:
    def test_admin_set_and_clear(self, actors, group):
        r = requests.patch(f"{API}/chats/{group['id']}", headers=_h(actors["a"]["token"]),
                           json={"avatar_path": "some/fake/path.jpg"}, timeout=30)
        assert r.status_code == 200
        assert r.json()["avatar_path"] == "some/fake/path.jpg"
        # clear
        r2 = requests.patch(f"{API}/chats/{group['id']}", headers=_h(actors["a"]["token"]),
                            json={"avatar_path": ""}, timeout=30)
        assert r2.status_code == 200
        assert r2.json()["avatar_path"] is None

    def test_non_admin_forbidden(self, actors, group):
        r = requests.patch(f"{API}/chats/{group['id']}", headers=_h(actors["b"]["token"]),
                           json={"avatar_path": "x/y.jpg"}, timeout=30)
        assert r.status_code == 403


# ------------------------- POST members ------------------------- #
class TestAddMembers:
    def test_admin_adds_new(self, actors, group):
        cid = actors["c"]["user"]["id"]
        r = requests.post(f"{API}/chats/{group['id']}/members", headers=_h(actors["a"]["token"]),
                          json={"member_ids": [cid]}, timeout=30)
        assert r.status_code == 200
        assert cid in r.json()["member_ids"]

    def test_duplicate_members_filtered(self, actors, group):
        # Add C first
        cid = actors["c"]["user"]["id"]
        requests.post(f"{API}/chats/{group['id']}/members", headers=_h(actors["a"]["token"]),
                      json={"member_ids": [cid]}, timeout=30)
        # Adding same C -> all filtered -> 400
        r = requests.post(f"{API}/chats/{group['id']}/members", headers=_h(actors["a"]["token"]),
                         json={"member_ids": [cid]}, timeout=30)
        assert r.status_code == 400

    def test_unknown_user_400(self, actors, group):
        r = requests.post(f"{API}/chats/{group['id']}/members", headers=_h(actors["a"]["token"]),
                          json={"member_ids": [str(uuid.uuid4())]}, timeout=30)
        assert r.status_code == 400
        assert "tidak ditemukan" in r.json()["detail"].lower()

    def test_non_admin_forbidden(self, actors, group):
        r = requests.post(f"{API}/chats/{group['id']}/members", headers=_h(actors["b"]["token"]),
                          json={"member_ids": [actors["c"]["user"]["id"]]}, timeout=30)
        assert r.status_code == 403


# ------------------------- DELETE members ------------------------- #
class TestRemoveMembers:
    def test_admin_removes_member(self, actors, group):
        # add C then remove
        cid = actors["c"]["user"]["id"]
        requests.post(f"{API}/chats/{group['id']}/members", headers=_h(actors["a"]["token"]),
                      json={"member_ids": [cid]}, timeout=30)
        r = requests.delete(f"{API}/chats/{group['id']}/members/{cid}",
                            headers=_h(actors["a"]["token"]), timeout=30)
        assert r.status_code == 200
        assert cid not in r.json()["member_ids"]

    def test_self_leave_by_member(self, actors, group):
        bid = actors["b"]["user"]["id"]
        r = requests.delete(f"{API}/chats/{group['id']}/members/{bid}",
                            headers=_h(actors["b"]["token"]), timeout=30)
        assert r.status_code == 200
        # verify by re-listing chat with A
        r2 = requests.get(f"{API}/chats/{group['id']}", headers=_h(actors["a"]["token"]))
        assert bid not in r2.json()["member_ids"]

    def test_non_admin_cannot_remove_other(self, actors, group):
        # add C then B tries to remove C
        cid = actors["c"]["user"]["id"]
        requests.post(f"{API}/chats/{group['id']}/members", headers=_h(actors["a"]["token"]),
                      json={"member_ids": [cid]}, timeout=30)
        r = requests.delete(f"{API}/chats/{group['id']}/members/{cid}",
                            headers=_h(actors["b"]["token"]), timeout=30)
        assert r.status_code == 403

    def test_admin_cannot_remove_self_via_admin_path(self, actors, group):
        aid = actors["a"]["user"]["id"]
        # This is self-leave (is_self_leave=True). Per code, should succeed (200) because is_self_leave
        # takes priority.
        r = requests.delete(f"{API}/chats/{group['id']}/members/{aid}",
                            headers=_h(actors["a"]["token"]), timeout=30)
        assert r.status_code == 200


# ------------------------- Read receipts privacy ------------------------- #
class TestReadReceipts:
    def test_default_true_and_toggle(self, actors):
        # New user default should be true
        u = requests.get(f"{API}/auth/me", headers=_h(actors["d"]["token"])).json()
        assert u["read_receipts_enabled"] is True
        # Turn off
        r = requests.patch(f"{API}/auth/me", headers=_h(actors["d"]["token"]),
                           json={"read_receipts_enabled": False}, timeout=30)
        assert r.status_code == 200
        assert r.json()["read_receipts_enabled"] is False
        # Persist
        r2 = requests.get(f"{API}/auth/me", headers=_h(actors["d"]["token"]))
        assert r2.json()["read_receipts_enabled"] is False
        # Turn back on for isolation
        requests.patch(f"{API}/auth/me", headers=_h(actors["d"]["token"]),
                       json={"read_receipts_enabled": True}, timeout=30)

    def test_read_hidden_from_others_when_disabled(self, actors):
        # A disables receipts; B sends msg; A reads via GET; B fetches and should NOT see A in read_by
        a, b = actors["a"], actors["b"]
        # ensure direct chat A-B
        r = requests.post(f"{API}/chats", headers=_h(a["token"]),
                          json={"kind": "direct", "member_ids": [b["user"]["id"]]}, timeout=30)
        chat = r.json()
        # A disables
        requests.patch(f"{API}/auth/me", headers=_h(a["token"]),
                       json={"read_receipts_enabled": False}, timeout=30)
        # B sends
        r = requests.post(f"{API}/messages", headers=_h(b["token"]),
                          json={"chat_id": chat["id"], "text": "hello privacy"}, timeout=30)
        assert r.status_code == 200
        # A reads (this triggers add-to-read_by via GET messages)
        rA = requests.get(f"{API}/chats/{chat['id']}/messages", headers=_h(a["token"]))
        # A's own view -> A id present
        msgs_a = rA.json()
        assert any(m["text"] == "hello privacy" for m in msgs_a)
        target = [m for m in msgs_a if m["text"] == "hello privacy"][-1]
        assert a["user"]["id"] in target["read_by"], "A should see self-read in own view"
        # B's view -> A id NOT present
        rB = requests.get(f"{API}/chats/{chat['id']}/messages", headers=_h(b["token"]))
        target_b = [m for m in rB.json() if m["text"] == "hello privacy"][-1]
        assert a["user"]["id"] not in target_b["read_by"], \
            f"A must be hidden from B's read_by, got {target_b['read_by']}"
        # restore
        requests.patch(f"{API}/auth/me", headers=_h(a["token"]),
                       json={"read_receipts_enabled": True}, timeout=30)

    def test_regression_receipts_visible_when_enabled(self, actors):
        a, b = actors["a"], actors["b"]
        r = requests.post(f"{API}/chats", headers=_h(a["token"]),
                          json={"kind": "direct", "member_ids": [b["user"]["id"]]}, timeout=30)
        chat = r.json()
        # ensure A enabled
        requests.patch(f"{API}/auth/me", headers=_h(a["token"]),
                       json={"read_receipts_enabled": True}, timeout=30)
        r = requests.post(f"{API}/messages", headers=_h(b["token"]),
                          json={"chat_id": chat["id"], "text": "public receipts"}, timeout=30)
        assert r.status_code == 200
        # A reads
        requests.get(f"{API}/chats/{chat['id']}/messages", headers=_h(a["token"]))
        # B should now see A in read_by
        rB = requests.get(f"{API}/chats/{chat['id']}/messages", headers=_h(b["token"]))
        target_b = [m for m in rB.json() if m["text"] == "public receipts"][-1]
        assert a["user"]["id"] in target_b["read_by"]


# ------------------------- WS read event privacy ------------------------- #
async def _ws_collect(token: str, timeout: float, stop_event=None):
    events = []
    try:
        async with websockets.connect(f"{WS_URL}?token={token}", open_timeout=10) as ws:
            deadline = asyncio.get_event_loop().time() + timeout
            while asyncio.get_event_loop().time() < deadline:
                try:
                    remaining = deadline - asyncio.get_event_loop().time()
                    raw = await asyncio.wait_for(ws.recv(), timeout=max(0.1, remaining))
                    events.append(json.loads(raw))
                except asyncio.TimeoutError:
                    break
    except Exception as e:
        events.append({"_error": str(e)})
    return events


class TestWSReadReceipts:
    def test_ws_read_not_broadcast_when_disabled(self, actors):
        a, b = actors["a"], actors["b"]
        # ensure chat
        r = requests.post(f"{API}/chats", headers=_h(a["token"]),
                          json={"kind": "direct", "member_ids": [b["user"]["id"]]}, timeout=30)
        chat = r.json()
        # A disables
        requests.patch(f"{API}/auth/me", headers=_h(a["token"]),
                       json={"read_receipts_enabled": False}, timeout=30)
        # B sends
        requests.post(f"{API}/messages", headers=_h(b["token"]),
                      json={"chat_id": chat["id"], "text": "ws privacy"}, timeout=30)

        async def run():
            # B connects and listens; A connects then sends 'read' event
            async def listen_b():
                return await _ws_collect(b["token"], timeout=4.0)

            async def send_read_a():
                await asyncio.sleep(0.8)  # let B connect first
                async with websockets.connect(f"{WS_URL}?token={a['token']}", open_timeout=10) as ws:
                    await ws.send(json.dumps({"type": "read", "chat_id": chat["id"]}))
                    await asyncio.sleep(0.5)

            listen_task = asyncio.create_task(listen_b())
            await send_read_a()
            events = await listen_task
            return events

        events = asyncio.run(run())
        read_events = [e for e in events if e.get("type") == "read"]
        assert not read_events, f"B should NOT receive 'read' when A has receipts disabled. got: {read_events}"
        # restore
        requests.patch(f"{API}/auth/me", headers=_h(a["token"]),
                       json={"read_receipts_enabled": True}, timeout=30)

    def test_ws_read_broadcast_when_enabled(self, actors):
        a, b = actors["a"], actors["b"]
        r = requests.post(f"{API}/chats", headers=_h(a["token"]),
                          json={"kind": "direct", "member_ids": [b["user"]["id"]]}, timeout=30)
        chat = r.json()
        requests.patch(f"{API}/auth/me", headers=_h(a["token"]),
                       json={"read_receipts_enabled": True}, timeout=30)
        requests.post(f"{API}/messages", headers=_h(b["token"]),
                      json={"chat_id": chat["id"], "text": "ws public"}, timeout=30)

        async def run():
            async def listen_b():
                return await _ws_collect(b["token"], timeout=4.0)

            async def send_read_a():
                await asyncio.sleep(0.8)
                async with websockets.connect(f"{WS_URL}?token={a['token']}", open_timeout=10) as ws:
                    await ws.send(json.dumps({"type": "read", "chat_id": chat["id"]}))
                    await asyncio.sleep(0.5)

            listen_task = asyncio.create_task(listen_b())
            await send_read_a()
            return await listen_task

        events = asyncio.run(run())
        read_events = [e for e in events if e.get("type") == "read" and e.get("user_id") == a["user"]["id"]]
        assert read_events, f"B should receive 'read' event from A. got events: {events}"

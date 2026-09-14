"""WhatsApp Clone backend tests."""
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

ALICE = {"email": "alice@test.com", "password": "password123"}
BOB = {"email": "bob@test.com", "password": "password123"}


@pytest.fixture(scope="module")
def alice_token():
    r = requests.post(f"{API}/auth/login", json=ALICE, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()


@pytest.fixture(scope="module")
def bob_token():
    r = requests.post(f"{API}/auth/login", json=BOB, timeout=15)
    assert r.status_code == 200, r.text
    return r.json()


def h(tok):
    return {"Authorization": f"Bearer {tok}"}


# ---------------- AUTH ---------------- #
class TestAuth:
    def test_login_ok(self, alice_token):
        assert "access_token" in alice_token
        assert alice_token["user"]["email"] == "alice@test.com"

    def test_login_wrong_pw(self):
        r = requests.post(f"{API}/auth/login", json={"email": "alice@test.com", "password": "wrong"})
        assert r.status_code == 401

    def test_register_duplicate(self):
        r = requests.post(f"{API}/auth/register", json={**ALICE, "name": "Alice"})
        assert r.status_code == 409

    def test_register_new_and_me(self):
        email = f"test_{uuid.uuid4().hex[:8]}@t.com"
        r = requests.post(f"{API}/auth/register", json={"email": email, "password": "password123", "name": "T"})
        assert r.status_code == 200
        tok = r.json()["access_token"]
        me = requests.get(f"{API}/auth/me", headers=h(tok))
        assert me.status_code == 200
        assert me.json()["email"] == email

    def test_patch_me(self, alice_token):
        new_about = f"about-{uuid.uuid4().hex[:6]}"
        r = requests.patch(f"{API}/auth/me", json={"about": new_about}, headers=h(alice_token["access_token"]))
        assert r.status_code == 200
        assert r.json()["about"] == new_about
        # verify via GET
        me = requests.get(f"{API}/auth/me", headers=h(alice_token["access_token"]))
        assert me.json()["about"] == new_about


# ---------------- USERS ---------------- #
class TestUsers:
    def test_list_excludes_self(self, alice_token):
        r = requests.get(f"{API}/users", headers=h(alice_token["access_token"]))
        assert r.status_code == 200
        ids = [u["id"] for u in r.json()]
        assert alice_token["user"]["id"] not in ids


# ---------------- CHATS ---------------- #
class TestChats:
    def test_direct_idempotent(self, alice_token, bob_token):
        bob_id = bob_token["user"]["id"]
        payload = {"kind": "direct", "member_ids": [bob_id]}
        r1 = requests.post(f"{API}/chats", json=payload, headers=h(alice_token["access_token"]))
        r2 = requests.post(f"{API}/chats", json=payload, headers=h(alice_token["access_token"]))
        assert r1.status_code == 200 and r2.status_code == 200
        assert r1.json()["id"] == r2.json()["id"]

    def test_group_requires_name(self, alice_token, bob_token):
        r = requests.post(f"{API}/chats", json={"kind": "group", "member_ids": [bob_token["user"]["id"]]}, headers=h(alice_token["access_token"]))
        assert r.status_code == 400

    def test_group_ok(self, alice_token, bob_token):
        r = requests.post(f"{API}/chats", json={"kind": "group", "name": "TEST_grp", "member_ids": [bob_token["user"]["id"]]}, headers=h(alice_token["access_token"]))
        assert r.status_code == 200
        assert r.json()["kind"] == "group"
        assert r.json()["name"] == "TEST_grp"

    def test_list_chats(self, alice_token):
        r = requests.get(f"{API}/chats", headers=h(alice_token["access_token"]))
        assert r.status_code == 200
        assert isinstance(r.json(), list)


# ---------------- MESSAGES ---------------- #
class TestMessages:
    def test_send_and_list_marks_read(self, alice_token, bob_token):
        # Create direct chat
        r = requests.post(f"{API}/chats", json={"kind": "direct", "member_ids": [bob_token["user"]["id"]]}, headers=h(alice_token["access_token"]))
        chat_id = r.json()["id"]
        unique = f"hi bob {uuid.uuid4().hex[:6]}"
        # Alice sends
        m = requests.post(f"{API}/messages", json={"chat_id": chat_id, "text": unique}, headers=h(alice_token["access_token"]))
        assert m.status_code == 200
        assert m.json()["id"] and m.json()["created_at"]
        msg_id = m.json()["id"]

        # Bob lists → should mark read
        lst = requests.get(f"{API}/chats/{chat_id}/messages", headers=h(bob_token["access_token"]))
        assert lst.status_code == 200
        msgs = lst.json()
        target = next((msg for msg in msgs if msg["id"] == msg_id), None)
        assert target is not None
        # Second GET to observe the mark-as-read effect (first GET marks it)
        lst2 = requests.get(f"{API}/chats/{chat_id}/messages", headers=h(bob_token["access_token"]))
        target2 = next((msg for msg in lst2.json() if msg["id"] == msg_id), None)
        assert bob_token["user"]["id"] in target2["read_by"]

    def test_empty_message_rejected(self, alice_token, bob_token):
        r = requests.post(f"{API}/chats", json={"kind": "direct", "member_ids": [bob_token["user"]["id"]]}, headers=h(alice_token["access_token"]))
        chat_id = r.json()["id"]
        m = requests.post(f"{API}/messages", json={"chat_id": chat_id}, headers=h(alice_token["access_token"]))
        assert m.status_code == 400


# ---------------- WEBSOCKET ---------------- #
class TestWebSocket:
    def test_invalid_token_rejected(self):
        async def run():
            try:
                async with websockets.connect(f"{WS_URL}?token=bad") as ws:
                    await asyncio.wait_for(ws.recv(), timeout=3)
                return False
            except Exception:
                return True
        assert asyncio.run(run())

    def test_valid_connect_and_broadcast(self, alice_token, bob_token):
        atok = alice_token["access_token"]
        btok = bob_token["access_token"]
        # ensure direct chat
        r = requests.post(f"{API}/chats", json={"kind": "direct", "member_ids": [bob_token["user"]["id"]]}, headers=h(atok))
        chat_id = r.json()["id"]

        async def run():
            async with websockets.connect(f"{WS_URL}?token={btok}") as bws:
                await asyncio.sleep(0.5)
                # alice sends via HTTP
                requests.post(f"{API}/messages", json={"chat_id": chat_id, "text": "ws-hello"}, headers=h(atok))
                # bob should receive within 5s
                got = None
                for _ in range(10):
                    try:
                        raw = await asyncio.wait_for(bws.recv(), timeout=1.0)
                        data = json.loads(raw)
                        if data.get("type") == "message" and data["data"].get("text") == "ws-hello":
                            got = data
                            break
                    except asyncio.TimeoutError:
                        continue
                return got

        result = asyncio.run(run())
        assert result is not None, "Did not receive websocket broadcast"


# ---------------- FILES ---------------- #
class TestFiles:
    def test_upload_and_download(self, alice_token):
        content = b"hello world " + uuid.uuid4().bytes
        files = {"file": ("test.txt", content, "text/plain")}
        r = requests.post(f"{API}/upload", files=files, headers=h(alice_token["access_token"]))
        if r.status_code != 200:
            pytest.skip(f"Storage not available: {r.status_code} {r.text}")
        path = r.json()["path"]
        # download via token query
        d = requests.get(f"{API}/files/{path}?token={alice_token['access_token']}")
        assert d.status_code == 200
        assert d.content == content

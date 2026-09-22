"""Verifikasi WebSocket real-time KPChat: user A kirim pesan -> user B terima event."""
import asyncio, json, time, requests, websockets

BASE = "http://localhost:8001/api"
WS = "ws://localhost:8001/api/ws"


def mkuser(suffix: str):
    phone = f"+62899{int(time.time())%100000}{suffix}"
    r = requests.post(f"{BASE}/auth/otp/request", json={"phone": phone, "name": f"WS{suffix}", "purpose": "register"}).json()
    v = requests.post(f"{BASE}/auth/otp/verify", json={"phone": phone, "code": r["dev_code"], "purpose": "register", "name": f"WS{suffix}"}).json()
    return v["access_token"], v["user"]["id"], phone


async def main():
    ta, ida, pa = mkuser("1")
    tb, idb, pb = mkuser("2")
    print(f"user A={ida[:8]} ({pa})  user B={idb[:8]} ({pb})")

    chat = requests.post(f"{BASE}/chats", json={"type": "private", "member_ids": [idb]},
                         headers={"Authorization": f"Bearer {ta}"}).json()
    cid = chat["id"]
    print("chat:", cid[:8])

    got = []
    async with websockets.connect(f"{WS}?token={tb}") as wsb:
        print("WS user B: CONNECTED")
        await asyncio.sleep(1)

        res = requests.post(f"{BASE}/messages", json={"chat_id": cid, "type": "text", "text": "halo via websocket"},
                            headers={"Authorization": f"Bearer {ta}"})
        print("A kirim pesan -> HTTP", res.status_code)

        try:
            for _ in range(5):
                raw = await asyncio.wait_for(wsb.recv(), timeout=8)
                ev = json.loads(raw)
                got.append(ev)
                print("WS B terima:", json.dumps(ev)[:180])
                if ev.get("type") == "message":
                    break
        except asyncio.TimeoutError:
            print("TIMEOUT menunggu event")

    ok = any(e.get("type") == "message" and e.get("data", {}).get("text") == "halo via websocket" for e in got)
    print("\n=== HASIL:", "PASS - WebSocket real-time BEKERJA" if ok else "FAIL - event message tidak diterima", "===")
    return ok


if __name__ == "__main__":
    raise SystemExit(0 if asyncio.run(main()) else 1)

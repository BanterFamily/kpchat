"""WhatsApp Clone Backend - FastAPI + MongoDB + WebSocket."""

import asyncio
import logging
import os
import re
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Dict, List, Literal, Optional, Set

import bcrypt
import jwt
import requests
from dotenv import load_dotenv
from fastapi import (
    APIRouter,
    Depends,
    FastAPI,
    File,
    Header,
    HTTPException,
    UploadFile,
    WebSocket,
    WebSocketDisconnect,
    status,
)
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import Response
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field
from starlette.middleware.cors import CORSMiddleware

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

# ----------------------------- CONFIG ----------------------------- #
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALGORITHM = "HS256"
JWT_MINUTES = int(os.environ.get("JWT_EXPIRE_MINUTES", "43200"))
ALLOW_DEV_OTP = (os.environ.get("ALLOW_DEV_OTP", "false") or "").strip().lower() in ("1", "true", "yes")
ALLOWED_ORIGINS_RAW = (os.environ.get("ALLOWED_ORIGINS") or "").strip()
ALLOWED_ORIGINS = [o.strip() for o in ALLOWED_ORIGINS_RAW.split(",") if o.strip()]

# Upload / message size caps.
MAX_UPLOAD_BYTES = 20 * 1024 * 1024   # 20 MB
MAX_TEXT_LEN = 4000
ALLOWED_UPLOAD_PREFIXES = ("image/", "video/", "audio/", "application/pdf")

STORAGE_BASE = (os.environ.get("INTEGRATION_PROXY_URL") or "").strip() or "https://integrations.emergentagent.com"
STORAGE_URL = STORAGE_BASE.rstrip("/") + "/objstore/api/v1/storage"
EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY", "")
APP_NAME = "whatsapp-clone"

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("wa_clone")

# ----------------------------- DB ----------------------------- #
client = AsyncIOMotorClient(MONGO_URL)
db = client[DB_NAME]

# ----------------------------- STORAGE ----------------------------- #
_storage_key: Optional[str] = None


def _init_storage_sync() -> str:
    global _storage_key
    if _storage_key:
        return _storage_key
    resp = requests.post(
        f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_KEY}, timeout=30
    )
    resp.raise_for_status()
    _storage_key = resp.json()["storage_key"]
    return _storage_key


def _put_object_sync(path: str, data: bytes, content_type: str) -> dict:
    key = _init_storage_sync()
    resp = requests.put(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key, "Content-Type": content_type},
        data=data,
        timeout=120,
    )
    resp.raise_for_status()
    return resp.json()


def _get_object_sync(path: str):
    global _storage_key
    key = _init_storage_sync()
    resp = requests.get(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key},
        timeout=60,
    )
    if resp.status_code == 503:
        _storage_key = None
        key = _init_storage_sync()
        resp = requests.get(
            f"{STORAGE_URL}/objects/{path}",
            headers={"X-Storage-Key": key},
            timeout=60,
        )
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")


# ----------------------------- APP ----------------------------- #
app = FastAPI(title="WhatsApp Clone API")
api = APIRouter(prefix="/api")


@app.on_event("startup")
async def startup():
    await db.users.create_index("phone", unique=True)
    await db.messages.create_index([("chat_id", 1), ("created_at", 1)])
    await db.chats.create_index("member_ids")
    await db.otps.create_index("expires_at", expireAfterSeconds=0)
    await db.otps.create_index([("phone", 1), ("created_at", -1)])
    try:
        if EMERGENT_KEY:
            await run_in_threadpool(_init_storage_sync)
            logger.info("Object storage initialised")
    except Exception as exc:  # noqa
        logger.warning("Storage init failed: %s", exc)


@app.on_event("shutdown")
async def shutdown():
    client.close()


# ----------------------------- MODELS ----------------------------- #
class OTPRequestIn(BaseModel):
    phone: str = Field(min_length=2, max_length=32)
    purpose: Literal["register", "login"]
    name: Optional[str] = Field(default=None, max_length=60)


class OTPVerifyIn(BaseModel):
    phone: str = Field(min_length=2, max_length=32)
    code: str = Field(pattern=r"^\d{6}$")
    name: Optional[str] = Field(default=None, max_length=60)


class OTPRequestOut(BaseModel):
    phone: str
    expires_in: int
    dev_code: Optional[str] = None


class UserOut(BaseModel):
    id: str
    phone: str
    name: str
    about: str
    avatar_path: Optional[str] = None
    online: bool = False
    last_seen: Optional[str] = None


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class UpdateProfileIn(BaseModel):
    name: Optional[str] = Field(default=None, min_length=1, max_length=60)
    about: Optional[str] = Field(default=None, max_length=160)
    avatar_path: Optional[str] = None


class CreateChatIn(BaseModel):
    kind: Literal["direct", "group"] = "direct"
    member_ids: List[str]
    name: Optional[str] = None  # for group chats


class ChatOut(BaseModel):
    id: str
    kind: str
    name: Optional[str]
    avatar_path: Optional[str] = None
    member_ids: List[str]
    members: List[UserOut]
    last_message: Optional[dict] = None
    unread_count: int = 0
    updated_at: str


class SendMessageIn(BaseModel):
    chat_id: str
    text: Optional[str] = Field(default=None, max_length=4000)
    media_path: Optional[str] = Field(default=None, max_length=512)
    media_type: Optional[Literal["image", "video", "audio", "file"]] = None
    audio_duration_ms: Optional[int] = Field(default=None, ge=0, le=5 * 60 * 1000)
    reply_to_id: Optional[str] = Field(default=None, max_length=64)


class ReplyPreview(BaseModel):
    id: str
    sender_id: str
    text: Optional[str] = None
    media_type: Optional[str] = None


class ReactIn(BaseModel):
    emoji: str


class MessageOut(BaseModel):
    id: str
    chat_id: str
    sender_id: str
    text: Optional[str]
    media_path: Optional[str]
    media_type: Optional[str]
    audio_duration_ms: Optional[int] = None
    created_at: str
    read_by: List[str]
    reply_to: Optional[ReplyPreview] = None
    reactions: Dict[str, List[str]] = Field(default_factory=dict)


# ----------------------------- HELPERS ----------------------------- #
E164_RE = re.compile(r"^\+[1-9]\d{7,14}$")
OTP_TTL_SECONDS = 300
OTP_COOLDOWN_SECONDS = 30
MAX_VERIFY_ATTEMPTS = 5


def normalize_phone(value: str) -> str:
    phone = re.sub(r"[\s\-()]+", "", (value or "").strip())
    if not phone:
        raise HTTPException(status_code=400, detail="Nomor telepon wajib diisi")
    if not phone.startswith("+"):
        phone = "+" + phone.lstrip("0")
    if not E164_RE.match(phone):
        raise HTTPException(status_code=400, detail="Nomor telepon tidak valid (gunakan format E.164, contoh: +6281234567890)")
    return phone


def hash_code(c: str) -> str:
    return bcrypt.hashpw(c.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_code(c: str, h: str) -> bool:
    try:
        return bcrypt.checkpw(c.encode("utf-8"), h.encode("utf-8"))
    except Exception:
        return False


def is_mock_sms() -> bool:
    return not (os.environ.get("TWILIO_ACCOUNT_SID") or "").strip()


async def send_sms_or_mock(phone: str, code: str) -> Optional[str]:
    """Return dev_code in mock mode ONLY when ALLOW_DEV_OTP=true; otherwise return None."""
    if is_mock_sms():
        if not ALLOW_DEV_OTP:
            logger.warning("OTP requested but no SMS provider is configured and ALLOW_DEV_OTP is false")
            raise HTTPException(status_code=503, detail="Layanan SMS belum dikonfigurasi. Hubungi admin.")
        logger.info("MOCK OTP for %s: %s", phone, code)
        return code
    sid = os.environ["TWILIO_ACCOUNT_SID"]
    auth = os.environ.get("TWILIO_AUTH_TOKEN")
    sender = os.environ.get("TWILIO_FROM")
    if not auth or not sender:
        raise HTTPException(status_code=500, detail="Twilio belum dikonfigurasi lengkap (TWILIO_AUTH_TOKEN / TWILIO_FROM kosong)")
    try:
        from twilio.rest import Client  # type: ignore
        from twilio.base.exceptions import TwilioRestException  # type: ignore
    except ImportError:
        raise HTTPException(status_code=500, detail="Paket twilio belum terpasang")
    try:
        message = await run_in_threadpool(
            lambda: Client(sid, auth).messages.create(
                body=f"Kode verifikasi KPChat kamu: {code}. Jangan bagikan ke siapa pun.",
                from_=sender,
                to=phone,
            )
        )
        logger.info("Twilio SMS queued sid=%s to=%s", getattr(message, "sid", "?"), phone)
    except TwilioRestException as exc:
        logger.warning("Twilio send failed to=%s status=%s code=%s msg=%s", phone, exc.status, exc.code, exc.msg)
        # 21608 = trial account: number not verified
        if exc.code == 21608:
            raise HTTPException(status_code=400, detail="Nomor ini belum diverifikasi di Twilio trial. Verifikasi dulu di Twilio Console, atau upgrade ke paid account.")
        if exc.code in (21211, 21614):
            raise HTTPException(status_code=400, detail="Nomor tidak valid untuk SMS")
        raise HTTPException(status_code=502, detail=f"Gagal kirim SMS: {exc.msg}")
    except Exception as exc:  # noqa
        logger.exception("Twilio unexpected error: %s", exc)
        raise HTTPException(status_code=502, detail="Gagal kirim SMS")
    return None


def create_token(user_id: str) -> str:
    now = datetime.now(timezone.utc)
    payload = {"sub": user_id, "iat": now, "exp": now + timedelta(minutes=JWT_MINUTES)}
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def _iso(dt: Optional[datetime]) -> Optional[str]:
    if not dt:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


def user_to_out(u: dict) -> UserOut:
    return UserOut(
        id=u["id"],
        phone=u["phone"],
        name=u["name"],
        about=u.get("about", "Hai! Saya menggunakan KPChat."),
        avatar_path=u.get("avatar_path"),
        online=bool(u.get("online", False)),
        last_seen=_iso(u.get("last_seen")),
    )


async def get_current_user(authorization: Optional[str] = Header(default=None)) -> dict:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    token = authorization.split(" ", 1)[1].strip()
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload.get("sub")
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


def _decode_token_or_none(token: Optional[str]) -> Optional[str]:
    if not token:
        return None
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload.get("sub")
    except jwt.PyJWTError:
        return None


# ----------------------------- AUTH ROUTES ----------------------------- #
@api.get("/")
async def root():
    return {"status": "ok", "app": "kpchat", "mock_sms": is_mock_sms()}


@api.post("/auth/otp/request", response_model=OTPRequestOut)
async def request_otp(body: OTPRequestIn):
    phone = normalize_phone(body.phone)
    now = datetime.now(timezone.utc)

    existing_user = await db.users.find_one({"phone": phone}, {"_id": 0})
    if body.purpose == "login" and not existing_user:
        raise HTTPException(status_code=404, detail="Nomor belum terdaftar. Silakan daftar dulu.")
    if body.purpose == "register" and existing_user:
        raise HTTPException(status_code=409, detail="Nomor sudah terdaftar. Silakan login.")

    latest = await db.otps.find_one({"phone": phone}, sort=[("created_at", -1)])
    if latest and (now - latest["created_at"].replace(tzinfo=timezone.utc)).total_seconds() < OTP_COOLDOWN_SECONDS:
        raise HTTPException(status_code=429, detail="Tunggu 30 detik sebelum meminta kode lagi.")

    code = f"{secrets.randbelow(1_000_000):06d}"
    expires = now + timedelta(seconds=OTP_TTL_SECONDS)
    await db.otps.delete_many({"phone": phone})
    await db.otps.insert_one({
        "phone": phone,
        "code_hash": hash_code(code),
        "purpose": body.purpose,
        "pending_name": (body.name or "").strip() or None,
        "created_at": now,
        "expires_at": expires,
        "attempts": 0,
    })

    dev_code = await send_sms_or_mock(phone, code)
    return OTPRequestOut(phone=phone, expires_in=OTP_TTL_SECONDS, dev_code=dev_code)


@api.post("/auth/otp/verify", response_model=TokenOut)
async def verify_otp(body: OTPVerifyIn):
    phone = normalize_phone(body.phone)
    now = datetime.now(timezone.utc)
    otp = await db.otps.find_one({"phone": phone}, sort=[("created_at", -1)])
    if not otp:
        raise HTTPException(status_code=400, detail="Kode tidak valid atau sudah kedaluwarsa")
    if otp["expires_at"].replace(tzinfo=timezone.utc) <= now:
        raise HTTPException(status_code=400, detail="Kode sudah kedaluwarsa")
    if otp.get("attempts", 0) >= MAX_VERIFY_ATTEMPTS:
        raise HTTPException(status_code=429, detail="Terlalu banyak percobaan. Minta kode baru.")

    if not verify_code(body.code, otp["code_hash"]):
        await db.otps.update_one({"_id": otp["_id"]}, {"$inc": {"attempts": 1}})
        raise HTTPException(status_code=400, detail="Kode tidak valid")

    # one-time use
    await db.otps.delete_one({"_id": otp["_id"]})

    user = await db.users.find_one({"phone": phone}, {"_id": 0})
    if not user:
        display_name = (body.name or otp.get("pending_name") or "").strip()
        if not display_name:
            raise HTTPException(status_code=400, detail="Nama wajib diisi untuk akun baru")
        user_id = str(uuid.uuid4())
        user = {
            "id": user_id,
            "phone": phone,
            "name": display_name,
            "about": "Hai! Saya menggunakan KPChat.",
            "avatar_path": None,
            "online": False,
            "last_seen": now,
            "created_at": now,
        }
        await db.users.insert_one(user)

    token = create_token(user["id"])
    return TokenOut(access_token=token, user=user_to_out(user))


@api.get("/auth/me", response_model=UserOut)
async def me(user=Depends(get_current_user)):
    return user_to_out(user)


@api.patch("/auth/me", response_model=UserOut)
async def update_me(body: UpdateProfileIn, user=Depends(get_current_user)):
    updates = {k: v for k, v in body.dict(exclude_unset=True).items() if v is not None}
    if updates:
        await db.users.update_one({"id": user["id"]}, {"$set": updates})
    updated = await db.users.find_one({"id": user["id"]}, {"_id": 0})
    return user_to_out(updated)


# ----------------------------- USERS ----------------------------- #
@api.get("/users", response_model=List[UserOut])
async def list_users(user=Depends(get_current_user)):
    docs = await db.users.find({"id": {"$ne": user["id"]}}, {"_id": 0}).to_list(1000)
    return [user_to_out(d) for d in docs]


@api.get("/users/{user_id}", response_model=UserOut)
async def get_user(user_id: str, _=Depends(get_current_user)):
    u = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not u:
        raise HTTPException(status_code=404, detail="Not found")
    return user_to_out(u)


# ----------------------------- CHATS ----------------------------- #
async def _build_chat_out(chat: dict, viewer_id: str) -> ChatOut:
    members_docs = await db.users.find(
        {"id": {"$in": chat["member_ids"]}}, {"_id": 0}
    ).to_list(100)
    members = [user_to_out(m) for m in members_docs]
    last = await db.messages.find_one(
        {"chat_id": chat["id"]}, {"_id": 0}, sort=[("created_at", -1)]
    )
    last_msg = None
    if last:
        last_msg = {
            "id": last["id"],
            "text": last.get("text"),
            "media_type": last.get("media_type"),
            "sender_id": last["sender_id"],
            "created_at": _iso(last["created_at"]),
        }
    unread = await db.messages.count_documents(
        {
            "chat_id": chat["id"],
            "sender_id": {"$ne": viewer_id},
            "read_by": {"$ne": viewer_id},
        }
    )
    return ChatOut(
        id=chat["id"],
        kind=chat["kind"],
        name=chat.get("name"),
        avatar_path=chat.get("avatar_path"),
        member_ids=chat["member_ids"],
        members=members,
        last_message=last_msg,
        unread_count=unread,
        updated_at=_iso(chat.get("updated_at", chat.get("created_at"))),
    )


@api.get("/chats", response_model=List[ChatOut])
async def list_chats(user=Depends(get_current_user)):
    chats = await db.chats.find(
        {"member_ids": user["id"]}, {"_id": 0}
    ).sort("updated_at", -1).to_list(200)
    return [await _build_chat_out(c, user["id"]) for c in chats]


@api.post("/chats", response_model=ChatOut)
async def create_chat(body: CreateChatIn, user=Depends(get_current_user)):
    member_ids = list({user["id"], *body.member_ids})
    if body.kind == "direct":
        if len(member_ids) != 2:
            raise HTTPException(status_code=400, detail="Direct chat needs 2 members")
        existing = await db.chats.find_one(
            {"kind": "direct", "member_ids": {"$all": member_ids, "$size": 2}},
            {"_id": 0},
        )
        if existing:
            return await _build_chat_out(existing, user["id"])
    else:
        if len(member_ids) < 2:
            raise HTTPException(status_code=400, detail="Group needs 2+ members")
        if not body.name:
            raise HTTPException(status_code=400, detail="Group name required")

    now = datetime.now(timezone.utc)
    chat_doc = {
        "id": str(uuid.uuid4()),
        "kind": body.kind,
        "name": body.name,
        "avatar_path": None,
        "member_ids": member_ids,
        "created_by": user["id"],
        "created_at": now,
        "updated_at": now,
    }
    await db.chats.insert_one(chat_doc)
    return await _build_chat_out(chat_doc, user["id"])


@api.get("/chats/{chat_id}", response_model=ChatOut)
async def get_chat(chat_id: str, user=Depends(get_current_user)):
    chat = await db.chats.find_one({"id": chat_id}, {"_id": 0})
    if not chat or user["id"] not in chat["member_ids"]:
        raise HTTPException(status_code=404, detail="Chat not found")
    return await _build_chat_out(chat, user["id"])


# ----------------------------- MESSAGES ----------------------------- #
def _msg_to_out(m: dict) -> MessageOut:
    reply = m.get("reply_to")
    return MessageOut(
        id=m["id"],
        chat_id=m["chat_id"],
        sender_id=m["sender_id"],
        text=m.get("text"),
        media_path=m.get("media_path"),
        media_type=m.get("media_type"),
        audio_duration_ms=m.get("audio_duration_ms"),
        created_at=_iso(m["created_at"]),
        read_by=m.get("read_by", []),
        reply_to=ReplyPreview(**reply) if reply else None,
        reactions=m.get("reactions", {}),
    )


@api.get("/chats/{chat_id}/messages", response_model=List[MessageOut])
async def list_messages(chat_id: str, user=Depends(get_current_user)):
    chat = await db.chats.find_one({"id": chat_id})
    if not chat or user["id"] not in chat["member_ids"]:
        raise HTTPException(status_code=404, detail="Chat not found")
    msgs = await db.messages.find({"chat_id": chat_id}, {"_id": 0}).sort(
        "created_at", 1
    ).to_list(1000)
    # mark as read
    await db.messages.update_many(
        {"chat_id": chat_id, "sender_id": {"$ne": user["id"]}, "read_by": {"$ne": user["id"]}},
        {"$addToSet": {"read_by": user["id"]}},
    )
    return [_msg_to_out(m) for m in msgs]


async def _persist_message(chat: dict, sender_id: str, body: SendMessageIn) -> dict:
    now = datetime.now(timezone.utc)
    reply_preview = None
    if body.reply_to_id:
        parent = await db.messages.find_one({"id": body.reply_to_id, "chat_id": chat["id"]}, {"_id": 0})
        if parent:
            reply_preview = {
                "id": parent["id"],
                "sender_id": parent["sender_id"],
                "text": parent.get("text"),
                "media_type": parent.get("media_type"),
            }
    msg_doc = {
        "id": str(uuid.uuid4()),
        "chat_id": chat["id"],
        "sender_id": sender_id,
        "text": body.text,
        "media_path": body.media_path,
        "media_type": body.media_type,
        "audio_duration_ms": body.audio_duration_ms,
        "created_at": now,
        "read_by": [sender_id],
        "reply_to": reply_preview,
        "reactions": {},
    }
    await db.messages.insert_one(msg_doc)
    await db.chats.update_one({"id": chat["id"]}, {"$set": {"updated_at": now}})
    return msg_doc


@api.post("/messages", response_model=MessageOut)
async def send_message(body: SendMessageIn, user=Depends(get_current_user)):
    chat = await db.chats.find_one({"id": body.chat_id})
    if not chat or user["id"] not in chat["member_ids"]:
        raise HTTPException(status_code=404, detail="Chat not found")
    if not body.text and not body.media_path:
        raise HTTPException(status_code=400, detail="Empty message")
    msg = await _persist_message(chat, user["id"], body)
    out = _msg_to_out(msg)
    await manager.broadcast_chat(chat, out.dict())
    return out


@api.post("/messages/{message_id}/react", response_model=MessageOut)
async def react_to_message(message_id: str, body: ReactIn, user=Depends(get_current_user)):
    msg = await db.messages.find_one({"id": message_id}, {"_id": 0})
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")
    chat = await db.chats.find_one({"id": msg["chat_id"]})
    if not chat or user["id"] not in chat["member_ids"]:
        raise HTTPException(status_code=403, detail="Not allowed")
    reactions: dict = dict(msg.get("reactions", {}) or {})
    emoji = body.emoji.strip()
    # Was the user already reacting with this exact emoji?
    already_same = emoji in reactions and user["id"] in reactions[emoji]
    # Remove any previous reactions by this user (single reaction per user).
    for e in list(reactions.keys()):
        if user["id"] in reactions[e]:
            reactions[e] = [u for u in reactions[e] if u != user["id"]]
            if not reactions[e]:
                del reactions[e]
    # If it was the same emoji, we've toggled off. Otherwise add the new one.
    if emoji and not already_same:
        reactions.setdefault(emoji, [])
        if user["id"] not in reactions[emoji]:
            reactions[emoji].append(user["id"])
    await db.messages.update_one({"id": message_id}, {"$set": {"reactions": reactions}})
    updated = await db.messages.find_one({"id": message_id}, {"_id": 0})
    out = _msg_to_out(updated)
    await manager.broadcast_chat(chat, {**out.dict(), "_event": "reaction"})
    return out


# ----------------------------- FILES ----------------------------- #
_SAFE_SERVE_TYPES = {
    "image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "image/heif",
    "video/mp4", "video/quicktime", "video/webm",
    "audio/mpeg", "audio/mp4", "audio/aac", "audio/m4a", "audio/x-m4a", "audio/wav", "audio/webm", "audio/ogg",
    "application/pdf",
}


def _pick_safe_content_type(claimed: str) -> str:
    """Return the claimed content type only if it is in a safe allowlist; else generic binary."""
    ct = (claimed or "").split(";")[0].strip().lower()
    if ct in _SAFE_SERVE_TYPES:
        return ct
    return "application/octet-stream"


async def _user_may_view(user_id: str, path: str, record: dict) -> bool:
    """A user may view a file when they own it OR it is referenced in a chat they belong to."""
    if record.get("owner_id") == user_id:
        return True
    own_user = await db.users.find_one({"id": user_id, "avatar_path": path}, {"_id": 0})
    if own_user:
        return True
    # Any user (including owner) can see it if it appears in a chat they belong to.
    chat_ids = await db.messages.distinct("chat_id", {"media_path": path})
    if chat_ids:
        member = await db.chats.find_one(
            {"id": {"$in": chat_ids}, "member_ids": user_id}, {"_id": 0, "id": 1}
        )
        if member:
            return True
    # Group / user avatars stored on the user profile (any authenticated user can view avatars).
    peer_with_avatar = await db.users.find_one({"avatar_path": path}, {"_id": 0, "id": 1})
    if peer_with_avatar:
        return True
    return False


@api.post("/upload")
async def upload(file: UploadFile = File(...), user=Depends(get_current_user)):
    ext = (file.filename or "file").rsplit(".", 1)[-1].lower() if "." in (file.filename or "") else "bin"
    ext = re.sub(r"[^a-z0-9]+", "", ext)[:8] or "bin"
    content_type = (file.content_type or "application/octet-stream").split(";")[0].strip().lower()
    if not any(content_type.startswith(pfx) for pfx in ALLOWED_UPLOAD_PREFIXES):
        raise HTTPException(status_code=415, detail="Tipe berkas tidak diizinkan")

    # Stream & enforce max size.
    buf = bytearray()
    while True:
        chunk = await file.read(1024 * 1024)
        if not chunk:
            break
        buf.extend(chunk)
        if len(buf) > MAX_UPLOAD_BYTES:
            raise HTTPException(status_code=413, detail=f"Berkas melebihi {MAX_UPLOAD_BYTES // (1024 * 1024)} MB")

    obj_path = f"{APP_NAME}/uploads/{user['id']}/{uuid.uuid4()}.{ext}"
    data = bytes(buf)
    result = await run_in_threadpool(_put_object_sync, obj_path, data, content_type)
    await db.files.insert_one(
        {
            "path": result["path"],
            "owner_id": user["id"],
            "content_type": content_type,
            "size": result.get("size", len(data)),
            "created_at": datetime.now(timezone.utc),
        }
    )
    return {"path": result["path"], "size": result.get("size", len(data))}


@api.get("/files/{path:path}")
async def download(path: str, token: Optional[str] = None, authorization: Optional[str] = Header(default=None)):
    # Accept either header or query token (query token is required for web <img> tags).
    user_id: Optional[str] = None
    if authorization and authorization.lower().startswith("bearer "):
        user_id = _decode_token_or_none(authorization.split(" ", 1)[1].strip())
    if not user_id:
        user_id = _decode_token_or_none(token)
    if not user_id:
        raise HTTPException(status_code=401, detail="Unauthorized")
    user = await db.users.find_one({"id": user_id})
    if not user:
        raise HTTPException(status_code=401, detail="Unauthorized")
    # Basic path traversal guard.
    if ".." in path or path.startswith("/"):
        raise HTTPException(status_code=400, detail="Invalid path")
    record = await db.files.find_one({"path": path})
    if not record:
        raise HTTPException(status_code=404, detail="File not found")
    if not await _user_may_view(user_id, path, record):
        raise HTTPException(status_code=403, detail="Forbidden")

    content, ctype = await run_in_threadpool(_get_object_sync, path)
    safe_ctype = _pick_safe_content_type(record.get("content_type") or ctype or "")
    headers = {
        "X-Content-Type-Options": "nosniff",
        "Cache-Control": "private, max-age=300",
    }
    # Force attachment for anything not in the safe inline allowlist so browsers do not
    # render attacker-supplied HTML/JS same-origin.
    if safe_ctype == "application/octet-stream":
        safe_name = re.sub(r"[^A-Za-z0-9._-]+", "_", path.rsplit("/", 1)[-1])[:80] or "file"
        headers["Content-Disposition"] = f'attachment; filename="{safe_name}"'
    return Response(content=content, media_type=safe_ctype, headers=headers)


# ----------------------------- WEBSOCKET ----------------------------- #
class ConnectionManager:
    def __init__(self) -> None:
        self.connections: Dict[str, Set[WebSocket]] = {}
        self.lock = asyncio.Lock()

    async def connect(self, user_id: str, ws: WebSocket) -> None:
        await ws.accept()
        async with self.lock:
            self.connections.setdefault(user_id, set()).add(ws)
        await db.users.update_one(
            {"id": user_id},
            {"$set": {"online": True, "last_seen": datetime.now(timezone.utc)}},
        )

    async def disconnect(self, user_id: str, ws: WebSocket) -> None:
        async with self.lock:
            conns = self.connections.get(user_id)
            if conns and ws in conns:
                conns.remove(ws)
            if conns is not None and not conns:
                self.connections.pop(user_id, None)
                await db.users.update_one(
                    {"id": user_id},
                    {"$set": {"online": False, "last_seen": datetime.now(timezone.utc)}},
                )

    async def send_to_user(self, user_id: str, message: dict) -> None:
        conns = list(self.connections.get(user_id, set()))
        for ws in conns:
            try:
                await ws.send_json(message)
            except Exception:
                pass

    async def broadcast_chat(self, chat: dict, message_payload: dict) -> None:
        for uid in chat["member_ids"]:
            await self.send_to_user(uid, {"type": "message", "data": message_payload})


manager = ConnectionManager()


@app.websocket("/api/ws")
async def websocket_endpoint(websocket: WebSocket, token: Optional[str] = None):
    user_id = _decode_token_or_none(token)
    if not user_id:
        await websocket.close(code=1008)
        return
    user = await db.users.find_one({"id": user_id})
    if not user:
        await websocket.close(code=1008)
        return
    await manager.connect(user_id, websocket)
    try:
        while True:
            data = await websocket.receive_json()
            mtype = data.get("type")
            if mtype == "ping":
                await websocket.send_json({"type": "pong"})
            elif mtype == "typing":
                chat_id = data.get("chat_id")
                chat = await db.chats.find_one({"id": chat_id})
                if chat and user_id in chat["member_ids"]:
                    for uid in chat["member_ids"]:
                        if uid != user_id:
                            await manager.send_to_user(
                                uid,
                                {"type": "typing", "chat_id": chat_id, "user_id": user_id},
                            )
            elif mtype == "read":
                chat_id = data.get("chat_id")
                if chat_id:
                    await db.messages.update_many(
                        {
                            "chat_id": chat_id,
                            "sender_id": {"$ne": user_id},
                            "read_by": {"$ne": user_id},
                        },
                        {"$addToSet": {"read_by": user_id}},
                    )
                    chat = await db.chats.find_one({"id": chat_id})
                    if chat:
                        for uid in chat["member_ids"]:
                            if uid != user_id:
                                await manager.send_to_user(
                                    uid,
                                    {"type": "read", "chat_id": chat_id, "user_id": user_id},
                                )
    except WebSocketDisconnect:
        pass
    except Exception as exc:  # noqa
        logger.warning("WS error: %s", exc)
    finally:
        await manager.disconnect(user_id, websocket)


# ----------------------------- MOUNT ----------------------------- #
app.include_router(api)
if ALLOWED_ORIGINS:
    app.add_middleware(
        CORSMiddleware,
        allow_credentials=True,
        allow_origins=ALLOWED_ORIGINS,
        allow_methods=["*"],
        allow_headers=["*"],
    )
else:
    # No credentialled requests (we use bearer tokens, not cookies) so wildcard is safe here.
    app.add_middleware(
        CORSMiddleware,
        allow_credentials=False,
        allow_origins=["*"],
        allow_methods=["*"],
        allow_headers=["*"],
    )

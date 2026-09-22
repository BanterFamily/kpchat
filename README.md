<div align="center">

# 💬 KPChat — BanterFamily

**Aplikasi chat real-time bergaya WhatsApp/Messenger**
Expo (React Native Web) · FastAPI · MongoDB · WebSocket

![status](https://img.shields.io/badge/status-active%20development-0084FF)
![platform](https://img.shields.io/badge/platform-iOS%20%7C%20Android%20%7C%20Web-050505)
![license](https://img.shields.io/badge/license-private-65676B)

</div>

---

## 📑 Daftar Isi

1. [Overview Project](#1-overview-project)
2. [Tech Stack](#2-tech-stack)
3. [Folder Structure](#3-folder-structure)
4. [Data Flow](#4-data-flow)
5. [Coding Conventions](#5-coding-conventions)
6. [Setup & Menjalankan Project](#6-setup--menjalankan-project)
7. [Environment Variables](#7-environment-variables)
8. [API Reference](#8-api-reference)
9. [Testing](#9-testing)
10. [Roadmap & Catatan Pengembangan](#10-roadmap--catatan-pengembangan)

---

## 1. Overview Project

**KPChat** adalah aplikasi *instant messaging* lintas platform (iOS, Android, dan Web) yang
dibangun untuk **BanterFamily**. Aplikasi ini meniru pengalaman WhatsApp/Messenger dengan
pengiriman pesan real-time berbasis WebSocket, autentikasi via **nomor telepon + OTP**, dan
dukungan media (gambar, video, voice note, dokumen).

### Fungsi Utama

| Domain | Fitur |
| --- | --- |
| 🔐 **Autentikasi** | Registrasi & login pakai nomor telepon, verifikasi OTP 6 digit, *country picker* (60+ negara), auto-fill OTP di mode dev, sesi JWT jangka panjang |
| 💬 **Chat 1-on-1 & Grup** | Buat chat pribadi, buat grup, daftar chat dengan preview pesan terakhir + badge unread |
| ⚡ **Real-time** | Pesan masuk instan, indikator *typing*, status online/last-seen, sinkronisasi multi-device — semuanya lewat satu koneksi WebSocket |
| ✅ **Read Receipts** | Centang terkirim/terbaca (blue ticks) + **toggle privasi** untuk menyembunyikan status baca |
| 🎙️ **Media & Voice** | Upload gambar/video/PDF (maks 20 MB), rekam & kirim *voice note* dengan waveform player |
| 😀 **Interaksi Pesan** | Reaksi emoji, *reply* (quote pesan), **Forward** ke banyak chat sekaligus, **Delete for Everyone** (soft-delete, batas 5 menit) |
| 👑 **Group Admin** | Ubah nama & foto grup, tambah/hapus anggota, keluar grup — dengan pembatasan hak akses admin |
| ⚙️ **Profil & Setelan** | Edit nama, about, foto profil, toggle read receipts, tema terang/gelap otomatis |
| 📲 **SMS Gateway** | Integrasi **Twilio** untuk OTP asli (opsional — fallback ke *dev mode* bila kredensial belum diisi) |

### Status Saat Ini

- ✅ Backend: 20+ endpoint REST + 1 WebSocket, lolos seluruh *security audit* internal.
- ✅ Frontend: 13 layar (Expo Router), tema terang/gelap, komponen bottom-sheet.
- ⚠️ **OTP masih mode DEV** (`ALLOW_DEV_OTP=true`) — kode OTP ditampilkan di response API,
  **bukan** dikirim via SMS. Isi kredensial Twilio untuk mengaktifkan SMS asli.
- ⚠️ Fitur native (kamera, mikrofon, push notification) hanya berfungsi penuh di *device* asli
  lewat Expo Go atau build EAS.

---

## 2. Tech Stack

### Frontend

| Komponen | Teknologi | Versi | Keterangan |
| --- | --- | --- | --- |
| Framework | **React Native** | `0.86.3` | Basis UI lintas platform |
| Runtime/Tooling | **Expo SDK** | `57.0.19` | Bundler Metro, OTA, native modules |
| Web Renderer | **react-native-web** | `0.21.2` | Render RN ke DOM untuk live preview |
| UI Library | **React** | `19.2.3` | — |
| Routing | **Expo Router** | `57.0.18` | *File-based routing* + typed routes |
| State Server | **TanStack Query** | `5.102.8` | Cache, refetch, dan invalidasi data API |
| State Auth | **React Context** | — | `src/auth-context.tsx` |
| Bottom Sheet | **@gorhom/bottom-sheet** | `5.2.14` | Sheet untuk aksi pesan, forward, kontak |
| Animasi | **Reanimated + Worklets** | `4.5.1` | Transisi & gesture |
| Ikon | **@react-native-vector-icons/ionicons** | `13.1.4` | — |
| Audio | **expo-audio** | `~57.0.5` | Rekam & play voice note |
| Media Picker | **expo-image-picker** | `~57.0.17` | Ambil foto/video |
| Bahasa | **TypeScript** | `6.0.3` | `strict` mode |

### Backend

| Komponen | Teknologi | Versi | Keterangan |
| --- | --- | --- | --- |
| Framework | **FastAPI** | `0.110.1` | REST + WebSocket |
| ASGI Server | **Uvicorn** | `0.25.0` | Bind `0.0.0.0:8001` |
| Validasi | **Pydantic** | `2.13.5` | Model request/response |
| Driver DB | **Motor** (async PyMongo) | `3.3.1` | Akses MongoDB non-blocking |
| Bahasa | **Python** | `3.11` | — |

### Database

| Aspek | Detail |
| --- | --- |
| Engine | **MongoDB** (single instance, `mongodb://localhost:27017`) |
| Nama DB | dari env `DB_NAME` (mis. `kpchat_database`) |
| Collections | `users`, `chats`, `messages`, `otps`, `files` |
| Primary Key | **UUID string** (`uuid.uuid4()`) — **bukan** `ObjectId`, supaya JSON-serializable |
| Index | `users.phone` (unique) · `messages.(chat_id, created_at)` · `chats.member_ids` · `otps.expires_at` (**TTL**, auto-expire) · `otps.(phone, created_at)` |

### Auth & Security

| Aspek | Detail |
| --- | --- |
| Metode | **Phone number + OTP 6 digit** (tanpa password) |
| Token | **JWT HS256**, TTL `JWT_EXPIRE_MINUTES` (default 43200 = 30 hari) |
| Hashing | **bcrypt** untuk hash kode OTP di DB (OTP plaintext tidak pernah disimpan) |
| Transport Token | Header `Authorization: Bearer <token>`; WebSocket via query `?token=` |
| Penyimpanan Klien | `expo-secure-store` (native) / `localStorage` (web) — key `kpchat_token` |
| Proteksi | Rate limit request OTP, **BOLA guard** (cek keanggotaan chat di tiap endpoint), batas ukuran upload & panjang teks, whitelist MIME type, CORS allowlist via `ALLOWED_ORIGINS` |
| SMS Gateway | **Twilio** (`twilio==9.11.1`) — aktif hanya bila `TWILIO_ACCOUNT_SID` terisi |

### Storage

| Aspek | Detail |
| --- | --- |
| Provider | **Emergent Object Storage** (S3-compatible via integration proxy) |
| Base URL | `INTEGRATION_PROXY_URL` + `/objstore/api/v1/storage` |
| Auth | `EMERGENT_LLM_KEY` → ditukar jadi `storage_key` saat startup, di-cache in-memory |
| Alur Upload | `POST /api/upload` → validasi MIME & size → `PUT` ke object store → metadata ke `db.files` → balik `path` |
| Alur Baca | `GET /api/files/{path}` → backend jadi *proxy* (stream) → klien tidak pernah pegang storage key |
| Batas | 20 MB/file; `image/*`, `video/*`, `audio/*`, `application/pdf` |

---

## 3. Folder Structure

```
kpchat/
│
├── backend/                         # 🐍 FastAPI service (port 8001)
│   ├── server.py                    # ⭐ SEMUA logika backend dalam 1 modul:
│   │                                #    config env, koneksi Motor, helper storage,
│   │                                #    model Pydantic, ConnectionManager (WebSocket),
│   │                                #    router /api, dan CORS middleware
│   ├── requirements.txt             # Dependency Python (hasil `pip freeze`)
│   ├── pytest.ini                   # Konfigurasi pytest (path, marker, output XML)
│   ├── .env                         # 🔒 Secret lokal — TIDAK di-commit (lihat §7)
│   └── tests/                       # Integration test (pytest + httpx)
│       ├── test_kpchat_phone_otp.py     # Registrasi/login OTP, JWT, profil
│       ├── test_reactions_reply_audio.py# Reaksi emoji, reply, voice note
│       ├── test_group_admin_receipts.py # Hak admin grup + privasi read receipt
│       ├── test_delete_forward.py       # Soft-delete & forward pesan
│       └── test_security.py             # BOLA, rate limit, batas upload, CORS
│
├── frontend/                        # 📱 Expo app (port 3000 untuk web)
│   ├── app/                         # ⭐ ROUTING — Expo Router file-based
│   │   ├── _layout.tsx              #   Root layout: QueryClient, AuthProvider,
│   │   │                            #   GestureHandler, ErrorBoundary, ThemeProvider
│   │   ├── index.tsx                #   Splash / gerbang redirect (auth vs tabs)
│   │   ├── +html.tsx                #   Template HTML khusus target web
│   │   ├── (auth)/                  #   Route group: alur belum login
│   │   │   ├── _layout.tsx          #     Stack navigator untuk auth
│   │   │   ├── login.tsx            #     Input nomor + country picker
│   │   │   ├── register.tsx         #     Daftar akun baru (nomor + nama)
│   │   │   └── verify.tsx           #     Input 6 digit OTP + resend timer
│   │   ├── (tabs)/                  #   Route group: aplikasi utama (bottom tabs)
│   │   │   ├── _layout.tsx          #     Definisi tab bar
│   │   │   ├── chats.tsx            #     📋 Daftar chat + unread badge
│   │   │   ├── status.tsx           #     Placeholder fitur Status/Story
│   │   │   ├── calls.tsx            #     Placeholder riwayat panggilan
│   │   │   └── settings.tsx         #     Profil, toggle read receipts, logout
│   │   ├── chat/
│   │   │   ├── [id].tsx             #   💬 Layar percakapan (dynamic route)
│   │   │   └── [id]/info.tsx        #   ⚙️ Info & admin tools grup
│   │   ├── new-chat.tsx             #   Pilih kontak untuk chat baru
│   │   └── new-group.tsx            #   Pilih anggota + nama grup
│   │
│   ├── src/                         # ⭐ LOGIKA NON-ROUTING (reusable)
│   │   ├── api.ts                   #   `apiFetch()` wrapper + token store + uploadFile()
│   │   ├── ws.ts                    #   `WSClient` singleton: auto-reconnect + heartbeat
│   │   ├── auth-context.tsx         #   Context: user, login, logout, bootstrap sesi
│   │   ├── query-client.ts          #   Instance & default option TanStack Query
│   │   ├── theme.ts                 #   🎨 Design token (light/dark), `useTheme()`,
│   │   │                            #   `makeStyles()`, `spacing`, `radius`
│   │   ├── data/countries.ts        #   Dataset kode negara + bendera
│   │   ├── utils/storage/           #   Abstraksi storage per-platform
│   │   │   ├── storage-base.ts      #     Interface bersama
│   │   │   ├── index.ts             #     Implementasi native (SecureStore)
│   │   │   └── index.web.ts         #     Implementasi web (localStorage)
│   │   └── components/              #   Komponen presentasional
│   │       ├── AppLogo.tsx          #     Logo KPChat responsif
│   │       ├── AuthContainer.tsx    #     Layout terpusat untuk layar auth
│   │       ├── CountryPicker.tsx    #     Bottom sheet pilih negara
│   │       ├── AudioMessage.tsx     #     Player voice note + progress bar
│   │       ├── MessageActionsSheet.tsx # Sheet long-press: react/reply/forward/delete
│   │       ├── ForwardPickerSheet.tsx  # Sheet multi-select tujuan forward
│   │       └── error-boundary.tsx   #     Penangkap crash React
│   │
│   ├── constants/testIds/           # 🧪 Registry `testID` untuk automation test
│   │   ├── index.js                 #   Barrel re-export
│   │   └── auth.js                  #   testID fitur auth
│   │
│   ├── assets/                      # Gambar, ikon, splash, font
│   │   ├── images/                  #   icon.png, kpchat-logo.png, splash-image.png, …
│   │   └── fonts/                   #   SpaceMono-Regular.ttf
│   │
│   ├── scripts/                     # Utility & command guard (infra Emergent)
│   ├── app.json                     # ⚙️ Konfigurasi Expo: nama, slug, ikon, plugin,
│   │                                #    permission iOS/Android, bundler web
│   ├── metro.config.js              # Konfigurasi Metro (FileStore cache, maxWorkers=2)
│   ├── tsconfig.json                # Path alias & strict TypeScript
│   ├── eslint.config.js             # ESLint (eslint-config-expo)
│   ├── package.json                 # Dependency & script npm/yarn
│   └── .env                         # 🔒 `EXPO_PUBLIC_BACKEND_URL` — tidak di-commit
│
├── memory/                          # 📝 Dokumentasi & konteks pengembangan
│   ├── PRD.md                       #   Product requirement + daftar fitur
│   ├── TWILIO_SETUP.md              #   Panduan mengisi kredensial Twilio
│   └── test_credentials.md          #   Akun uji (gitignored)
│
├── test_reports/                    # 📊 Output test otomatis
│   ├── iteration_*.json             #   Ringkasan tiap iterasi QA
│   └── pytest/*.xml                 #   JUnit XML hasil pytest
│
├── design_guidelines.json           # 🎨 Sumber kebenaran design system (warna, tipografi)
├── test_result.md                   # Catatan hasil testing manual/agent
└── README.md                        # 📖 Dokumen ini
```

> **Prinsip pemisahan:** `frontend/app/` **hanya** untuk screen & layout (routing).
> Semua logika yang bisa dipakai ulang — API client, context, hook, tema, komponen —
> tinggal di `frontend/src/`. Jangan menaruh komponen reusable di dalam `app/`.

---

## 4. Data Flow

### 4.1 Arsitektur Umum

```
┌──────────────────────────────────────────────────────────────────────┐
│                         CLIENT (Expo App)                            │
│   Screen (app/*.tsx)                                                 │
│        │                                                             │
│        ├─ useQuery / useMutation ──► src/api.ts  ─┐  (REST, stateful)│
│        └─ useEffect + subscribe ──► src/ws.ts   ─┤  (WebSocket, push)│
└───────────────────────────────────────────────────┼──────────────────┘
                                                    │ HTTPS / WSS
                              Kubernetes Ingress ───┤
                              (`/api/*` → :8001)    │
┌───────────────────────────────────────────────────▼──────────────────┐
│                     BACKEND (FastAPI @ :8001)                        │
│   APIRouter(prefix="/api")                                           │
│        │                                                             │
│        ├─ Depends(current_user) ──► verifikasi JWT (HS256)           │
│        ├─ Pydantic model ────────► validasi & sanitasi payload       │
│        ├─ BOLA guard ───────────► cek user ∈ chat.member_ids         │
│        │                                                             │
│        ├─ Motor (async) ────────────────► MongoDB                    │
│        └─ ConnectionManager.broadcast ─► WebSocket ke member lain     │
└──────────────────────────────────────────────────────────────────────┘
                    │                                │
                    ▼                                ▼
        ┌───────────────────────┐      ┌──────────────────────────────┐
        │  MongoDB              │      │ Emergent Object Storage      │
        │  users · chats        │      │ (gambar/video/audio/PDF)     │
        │  messages · otps      │      │ diproxy via GET /api/files/  │
        │  files                │      └──────────────────────────────┘
        └───────────────────────┘
```

### 4.2 Alur Autentikasi (OTP)

```
1. User isi nomor       → POST /api/auth/otp/request  { phone, name, purpose }
2. Backend              → rate-limit check
                        → generate 6 digit acak
                        → bcrypt-hash, simpan di db.otps (TTL 300s)
                        → Twilio.send_sms()  [jika kredensial ada]
                        → kembalikan { expires_in, dev_code? }
3. User isi OTP         → POST /api/auth/otp/verify   { phone, code, purpose, name }
4. Backend              → bcrypt.checkpw(code, stored_hash)
                        → upsert db.users (register) / ambil user (login)
                        → sign JWT (sub = user.id)
                        → kembalikan { access_token, user }
5. Klien                → saveToken() ke SecureStore/localStorage
                        → AuthContext.setUser(user)
                        → wsClient.connect()  (token di query string)
                        → router.replace("/(tabs)/chats")
```

### 4.3 Alur Kirim Pesan (REST write → WebSocket fan-out)

```
Pengirim                          Backend                        Penerima
   │                                 │                               │
   │ POST /api/messages              │                               │
   │ { chat_id, type, text,          │                               │
   │   reply_to?, media_path? }      │                               │
   ├────────────────────────────────►│                               │
   │                                 │ 1. verifikasi JWT             │
   │                                 │ 2. BOLA: user ∈ member_ids?   │
   │                                 │ 3. batasi panjang teks        │
   │                                 │ 4. insert db.messages         │
   │                                 │    (id = uuid4, created_at)   │
   │                                 │ 5. update db.chats            │
   │                                 │    .last_message + unread     │
   │                                 │ 6. broadcast ke member online │
   │                                 ├──────────────────────────────►│
   │◄────────── 200 { message } ─────┤   { type:"message", data:… }  │
   │                                 │                               │
   │ invalidateQueries(["messages"]) │          handler WS → append  │
```

- **Sumber kebenaran** selalu MongoDB. WebSocket **hanya** kanal notifikasi/push.
- Event WebSocket lain: `typing`, `read`, `presence`, `pong`, dan
  `_event: "deleted"` (sinkronisasi soft-delete antar device).
- Setiap mutasi selalu diikuti `queryClient.invalidateQueries(...)` supaya cache
  TanStack Query sinkron dengan server.

### 4.4 Alur Upload Media

```
1. expo-image-picker / expo-audio  → dapat local URI
2. uploadFile(uri, name, type)     → POST /api/upload (multipart/form-data)
3. Backend  → cek MIME ∈ allowlist, size ≤ 20 MB
            → PUT ke Object Storage (pakai storage_key cache)
            → insert metadata ke db.files
            → return { path }
4. Klien    → POST /api/messages { type:"image", media_path: path }
5. Render   → <Image source={{ uri: `${API_BASE}/api/files/${path}` }} />
              (backend stream sebagai proxy; storage key tidak pernah ke klien)
```

---

## 5. Coding Conventions

### 5.1 Penamaan File

| Jenis | Konvensi | Contoh |
| --- | --- | --- |
| Screen / route (Expo Router) | `kebab-case.tsx` | `new-group.tsx`, `login.tsx` |
| Route group | `(kurung)` | `(auth)/`, `(tabs)/` |
| Dynamic route | `[param].tsx` | `chat/[id].tsx` |
| Layout | `_layout.tsx` | `app/(tabs)/_layout.tsx` |
| Komponen React | `PascalCase.tsx` | `CountryPicker.tsx`, `AudioMessage.tsx` |
| Hook / util / context | `kebab-case.ts` | `auth-context.tsx`, `query-client.ts` |
| Modul non-komponen | `lowercase.ts` | `api.ts`, `ws.ts`, `theme.ts` |
| Test backend | `test_<fitur>.py` | `test_delete_forward.py` |
| Dokumen | `SCREAMING_CASE.md` | `PRD.md`, `TWILIO_SETUP.md` |

### 5.2 Penamaan Variabel & Simbol

**TypeScript / React Native**

```ts
// Variabel & fungsi → camelCase
const unreadCount = 0;
async function sendMessage() {}

// Komponen & Type/Interface → PascalCase
export type ThemeColors = typeof light;
export default function ChatScreen() {}

// Konstanta modul-level → SCREAMING_SNAKE_CASE
const TOKEN_KEY = "kpchat_token";
export const API_BASE = process.env.EXPO_PUBLIC_BACKEND_URL as string;

// Custom hook → wajib prefix `use`
export function useTheme() {}

// Boolean → prefix is/has/can/should
const isAdmin = chat.admin_ids.includes(user.id);

// Private class member → `private`, bukan underscore
class WSClient { private ws: WebSocket | null = null; }

// Field yang datang dari API → biarkan snake_case (jangan diubah)
const { chat_id, created_at, media_path } = message;
```

**Python / FastAPI**

```python
# Variabel & fungsi → snake_case
async def get_current_user(authorization: str = Header(None)): ...

# Model Pydantic & class → PascalCase
class MessageCreate(BaseModel):
    chat_id: str
    type: Literal["text", "image", "audio"]

# Konstanta → SCREAMING_SNAKE_CASE
MAX_UPLOAD_BYTES = 20 * 1024 * 1024

# Helper internal (tidak diekspor) → prefix underscore
def _put_object_sync(path: str, data: bytes, content_type: str) -> dict: ...
```

### 5.3 Konvensi API

- **Semua** route REST diawali `/api` (wajib, karena ingress me-route `/api/*` → backend).
- Path memakai **kebab-case / plural noun**: `/api/chats`, `/api/auth/otp/request`.
- Method sesuai semantik: `GET` baca · `POST` buat · `PATCH` ubah sebagian · `DELETE` hapus.
- Field JSON request & response memakai **`snake_case`** (konsisten dengan Python).
- ID selalu **UUID string**, bukan `ObjectId`. Jangan pernah bocorkan `_id` Mongo ke klien.
- Datetime selalu **ISO 8601 UTC** (`datetime.now(timezone.utc).isoformat()`).
- Error pakai `HTTPException(status_code=..., detail="pesan jelas")`.
- Setiap endpoint yang menyentuh chat **wajib** cek `user.id in chat["member_ids"]` (BOLA guard).

### 5.4 Style Coding

**Frontend**

- TypeScript `strict`. Hindari `any` kecuali untuk payload WebSocket dinamis.
- Styling pakai `makeStyles((colors) => ({ … }))` dari `src/theme.ts` — **jangan**
  hardcode nilai hex. Selalu ambil dari token (`colors.brand`, `spacing.lg`, `radius.md`).
- Spacing hanya dari skala `spacing` (`xs 4 · sm 8 · md 12 · lg 16 · xl 24 · xxl 32 · xxxl 48`).
- Radius hanya dari `radius` (`sm 6 · md 12 · lg 20 · pill 999`).
- Setiap warna latar punya pasangan `on*` untuk teks (mis. `surface` ↔ `onSurface`) —
  pakai berpasangan agar kontras aman di light & dark. **Jangan pakai background transparan.**
- Data server **selalu** via TanStack Query (`useQuery`/`useMutation`), bukan `useState` + `useEffect`.
- Semua elemen interaktif (Pressable, TextInput, Switch) **wajib** punya prop `testID`
  yang nilainya diambil dari `constants/testIds/` — format `<fitur>-<elemen>` kebab-case
  (mis. `login-submit-button`). React Native memakai `testID`, **bukan** `data-testid`.
- Import diurutkan: library eksternal → modul `src/*` → relatif (`./`).
- Selalu tangani 3 state UI: **loading**, **empty**, **error**.
- Teks yang dilihat user memakai **Bahasa Indonesia**.

**Backend**

- Semua I/O bersifat **async** (Motor, `await`). Operasi *blocking* (mis. `requests`)
  dibungkus `run_in_threadpool()`.
- Formatter **Black** (line length 100) + linter **flake8**/**ruff**, import diurutkan **isort**.
- Type hint wajib di signature fungsi publik.
- Validasi input di lapisan Pydantic, bukan di dalam handler.
- Env var kritis dibaca dengan `os.environ["X"]` (fail-fast saat boot); yang opsional
  pakai `os.environ.get("X", default)`.
- **Jangan pernah** hardcode secret/URL — semua lewat `.env`.
- Log dengan `logger` (modul `logging`), bukan `print()`.

**Git**

- Branch: `feat/<ringkas>`, `fix/<ringkas>`, `chore/<ringkas>`, `docs/<ringkas>`.
- Pesan commit gaya *Conventional Commits*: `feat:`, `fix:`, `docs:`, `chore:`, `refactor:`, `test:`.
- Jangan commit `.env`, `node_modules/`, `__pycache__/`, `.expo/`, `.metro-cache/`.

---

## 6. Setup & Menjalankan Project

### Prasyarat

- Node.js ≥ 20 · Yarn 1.22 (**jangan pakai npm** — akan merusak lockfile)
- Python 3.11 · MongoDB berjalan lokal

### Langkah

```bash
# 1. Clone
git clone https://github.com/BanterFamily/kpchat.git && cd kpchat

# 2. Backend
cd backend
pip install -r requirements.txt          # jika ada konflik resolver, install paket inti saja
cp .env.example .env                     # lalu isi sesuai §7
cd ..

# 3. Frontend
cd frontend
yarn install --network-timeout 600000
cp .env.example .env                     # isi EXPO_PUBLIC_BACKEND_URL
cd ..
```

### Menjalankan

```bash
# Backend (port 8001)
cd backend && uvicorn server:app --host 0.0.0.0 --port 8001 --reload

# Frontend — web (port 3000)
cd frontend && yarn start                # = expo start --web --port 3000

# Frontend — device asli (QR code Expo Go)
cd frontend && yarn start:dev            # = expo start
```

Di environment Emergent, keduanya dikelola **supervisor**:

```bash
supervisorctl status
supervisorctl restart backend
supervisorctl restart frontend
tail -n 50 /var/log/supervisor/backend.err.log /var/log/supervisor/frontend.out.log
```

> ⚠️ Restart service **hanya** setelah mengubah `.env` atau menambah dependency —
> hot reload sudah aktif untuk perubahan kode.

---

## 7. Environment Variables

### `backend/.env`

| Variabel | Wajib | Contoh | Fungsi |
| --- | --- | --- | --- |
| `MONGO_URL` | ✅ | `mongodb://localhost:27017` | Koneksi MongoDB |
| `DB_NAME` | ✅ | `kpchat_database` | Nama database |
| `JWT_SECRET` | ✅ | `<random 64 hex>` | Kunci tanda tangan JWT — **ganti untuk produksi** |
| `JWT_EXPIRE_MINUTES` | ➖ | `43200` | Masa hidup token (default 30 hari) |
| `ALLOW_DEV_OTP` | ➖ | `true` / `false` | Bila `true`, kode OTP dikembalikan di response (`dev_code`). **Wajib `false` di produksi** |
| `ALLOWED_ORIGINS` | ➖ | `https://app.contoh.com` | CORS allowlist (kosong = permisif, isi untuk produksi) |
| `EMERGENT_LLM_KEY` | ➖ | `sk-emergent-…` | Kunci akses Object Storage (upload media) |
| `INTEGRATION_PROXY_URL` | ➖ | `https://integrations.emergentagent.com` | Base URL integration proxy |
| `TWILIO_ACCOUNT_SID` | ➖ | `AC…` | Aktifkan SMS asli (kosong = mode dev) |
| `TWILIO_AUTH_TOKEN` | ➖ | `…` | Token Twilio |
| `TWILIO_FROM` | ➖ | `+1555…` | Nomor pengirim Twilio |

### `frontend/.env`

| Variabel | Wajib | Fungsi |
| --- | --- | --- |
| `EXPO_PUBLIC_BACKEND_URL` | ✅ | Base URL backend. **Harus** prefix `EXPO_PUBLIC_` agar terekspos ke bundle |

> 🚫 **Jangan** mengubah `MONGO_URL` (backend) dan base URL backend (frontend) di
> environment Emergent — keduanya sudah dipetakan oleh platform.

---

## 8. API Reference

Base URL: `{EXPO_PUBLIC_BACKEND_URL}/api` · Auth: `Authorization: Bearer <JWT>`

| Method | Endpoint | Auth | Deskripsi |
| --- | --- | :-: | --- |
| `GET` | `/` | — | Health check |
| `POST` | `/auth/otp/request` | — | Minta kode OTP (`purpose`: `register` \| `login`) |
| `POST` | `/auth/otp/verify` | — | Verifikasi OTP → `access_token` + `user` |
| `GET` | `/auth/me` | ✅ | Profil user aktif |
| `PATCH` | `/auth/me` | ✅ | Ubah nama, about, avatar, `read_receipts_enabled` |
| `GET` | `/users` | ✅ | Daftar kontak/user |
| `GET` | `/users/{user_id}` | ✅ | Detail user |
| `GET` | `/chats` | ✅ | Daftar chat + last message + unread |
| `POST` | `/chats` | ✅ | Buat chat privat atau grup |
| `GET` | `/chats/{chat_id}` | ✅ | Detail chat/grup |
| `PATCH` | `/chats/{chat_id}` | ✅ | Ubah nama/foto grup *(admin)* |
| `POST` | `/chats/{chat_id}/members` | ✅ | Tambah anggota *(admin)* |
| `DELETE` | `/chats/{chat_id}/members/{member_id}` | ✅ | Hapus anggota *(admin)* / keluar grup |
| `GET` | `/chats/{chat_id}/messages` | ✅ | Riwayat pesan (paginasi) |
| `POST` | `/messages` | ✅ | Kirim pesan (text/image/audio/video/file, `reply_to`) |
| `DELETE` | `/messages/{message_id}` | ✅ | Delete for everyone (soft-delete, ≤ 5 menit, pengirim saja) |
| `POST` | `/messages/{message_id}/forward` | ✅ | Teruskan ke banyak `chat_ids` |
| `POST` | `/messages/{message_id}/react` | ✅ | Toggle reaksi emoji |
| `POST` | `/upload` | ✅ | Upload media (multipart, ≤ 20 MB) → `{ path }` |
| `GET` | `/files/{path}` | ✅ | Proxy stream file dari object storage |
| `WS` | `/ws?token=<JWT>` | ✅ | Kanal real-time: `message`, `typing`, `read`, `presence`, `deleted`, `pong` |

Dokumentasi interaktif: **`{BACKEND_URL}/docs`** (Swagger UI).

---

## 9. Testing

```bash
# Seluruh test backend
cd backend && pytest -v

# Satu file
pytest tests/test_security.py -v

# Dengan output JUnit XML
pytest --junitxml=../test_reports/pytest/results.xml
```

| Suite | Cakupan |
| --- | --- |
| `test_kpchat_phone_otp.py` | Registrasi & login OTP, rate limit, JWT, update profil |
| `test_reactions_reply_audio.py` | Toggle reaksi, quote reply, upload & kirim voice note |
| `test_group_admin_receipts.py` | Rename/avatar grup, add/remove anggota, privasi read receipt |
| `test_delete_forward.py` | Soft-delete + tombstone, batas 5 menit, forward multi-tujuan |
| `test_security.py` | BOLA guard, rate limit, batas ukuran upload, MIME allowlist, CORS |

Hasil iterasi QA tersimpan di `test_reports/iteration_*.json`.

---

## 10. Roadmap & Catatan Pengembangan

### Belum Selesai / Butuh Aksi

- [ ] **Aktifkan Twilio** — isi `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM`,
      lalu set `ALLOW_DEV_OTP=false`. Panduan: `memory/TWILIO_SETUP.md`.
- [ ] **Hardening produksi** — `JWT_SECRET` baru, isi `ALLOWED_ORIGINS`, `ALLOW_DEV_OTP=false`.
- [ ] Layar **Status/Story** dan **Calls** masih placeholder.
- [ ] Belum ada push notification (butuh `expo-notifications` + build EAS).

### Ide Fitur Berikutnya

- [ ] **Message Search** — cari kata kunci di semua chat, lompat ke bubble-nya
- [ ] **Starred Messages** — bookmark pesan penting + tab khusus
- [ ] **Chat Wallpaper** — pemilih latar belakang per-chat
- [ ] **Disappearing Messages** — pesan auto-hapus (24 jam / 7 hari)
- [ ] **Voice & Video Call** — WebRTC
- [ ] **End-to-End Encryption** — Signal Protocol

### Panduan Menambah Fitur Baru

1. **Backend** — tambahkan model Pydantic + endpoint di `backend/server.py`
   (jangan lupa `/api` prefix, `Depends(current_user)`, dan BOLA guard).
   Bila perlu push real-time, panggil `ConnectionManager.broadcast()`.
2. **Test** — buat `backend/tests/test_<fitur>.py`, pastikan hijau via `pytest`.
3. **API Client** — tambahkan fungsi pemanggil di `frontend/src/api.ts`.
4. **Screen/Komponen** — screen baru di `frontend/app/`, komponen reusable di
   `frontend/src/components/`. Styling **hanya** lewat token `src/theme.ts`.
5. **testID** — daftarkan di `frontend/constants/testIds/<fitur>.js` dan pasang
   di setiap elemen interaktif.
6. **Dokumentasi** — perbarui §8 API Reference dan §10 Roadmap di README ini.

### Catatan Platform

- Kamera, mikrofon, SMS OTP asli, dan notifikasi **hanya** bisa diuji di device asli
  (Expo Go atau build EAS) — bukan di preview web.
- Preview web butuh ±20–30 detik untuk refresh setelah perubahan besar.
- Gunakan **Yarn**, bukan npm. Update `requirements.txt` lewat `pip freeze`, dan
  `package.json` lewat `yarn add`.

---

<div align="center">

**KPChat** · dibangun untuk [BanterFamily](https://github.com/BanterFamily)

</div>

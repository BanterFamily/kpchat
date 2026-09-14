# PRD — KPChat (Aplikasi Chat Mobile)

## Ringkasan
Aplikasi chat mobile bertema **biru Messenger** dengan chat 1-on-1, grup, media, voice notes, reply-quote, dan reaksi emoji. Autentikasi via **nomor telepon + OTP** (Mock/Demo mode, siap Twilio).

## Stack
- Frontend: Expo SDK 57, expo-router, expo-image, expo-image-picker, expo-audio, @gorhom/bottom-sheet, @react-native-vector-icons/ionicons
- Backend: FastAPI + Motor (async MongoDB) + PyJWT + bcrypt + WebSocket
- Storage: Emergent Managed Object Storage
- Auth: **Phone + OTP** (self-managed), JWT

## Fitur Utama
- **Autentikasi Phone + OTP** (Mock/Demo: kode 6-digit tampil di layar; siap Twilio via env)
  - Register: nomor + nama → OTP → verifikasi → masuk
  - Login: nomor → OTP → verifikasi → masuk
  - Cooldown 30s, expiry 5 menit, maksimal 5 percobaan, satu-kali-pakai
- Daftar Chat: preview, timestamp, unread, indikator online
- Chat Detail: bubble biru, ✓/✓✓ (dibaca), typing indicator
- Kirim foto (Emergent Object Storage)
- **Voice Notes**: tekan-tahan mic saat input kosong, waveform + play/pause
- **Reply-quote**: long-press → Balas
- **Reaksi Emoji** ❤️ 👍 😂 😮 😢 🙏
- Grup, kontak, setelan profile
- **Tema Messenger Blue**: brandPrimary `#0084FF`, brandSecondary `#0066CC`, brandTertiary `#DCEEFC` — light + dark mode

## Endpoint Backend (prefix `/api`)
- `POST /auth/otp/request` { phone, purpose: "register"|"login", name? }
- `POST /auth/otp/verify` { phone, code, name? } → TokenOut
- `GET /auth/me`, `PATCH /auth/me`
- `GET /users`, `GET /users/{id}`
- `GET/POST /chats`, `GET /chats/{id}`
- `GET /chats/{id}/messages`, `POST /messages`, `POST /messages/{id}/react`
- `POST /upload`, `GET /files/{path}?token=`
- `WS /api/ws?token=`

## Migrasi & Data
- Nama app: **KPChat** (di `app.json` → expo.name)
- Field user: `phone` (unique), tidak ada `email`/`password_hash`
- Data lama (email/password) sudah dihapus. User daftar ulang.

## Next Action Items
- Twilio SMS live (isi TWILIO_ACCOUNT_SID / _AUTH_TOKEN / _FROM)
- Story updates 24 jam, Delete for Everyone, Forward
- Grup management (kelola anggota, avatar grup)

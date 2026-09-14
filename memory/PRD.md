# PRD — WhatsApp Clone (Aplikasi Chat Mobile)

## Ringkasan
Aplikasi chat mobile bertema WhatsApp (hijau khas + light/dark mode) yang dibangun dengan Expo (React Native) + FastAPI + MongoDB. Mendukung chat 1-on-1, grup, media (foto), status online, indikator "sedang mengetik", dan tanda baca terkirim/dibaca. Real-time via WebSocket.

## Stack
- Frontend: Expo SDK 57, expo-router, expo-image, expo-image-picker, @gorhom/bottom-sheet, @react-native-vector-icons/ionicons
- Backend: FastAPI + Motor (async MongoDB) + PyJWT + bcrypt + WebSocket
- Storage: Emergent Managed Object Storage untuk foto profil & media chat
- Auth: JWT (email + password), disimpan aman di SecureStore/localStorage

## Fitur Utama (MVP)
- Autentikasi: Register & Login (email + password)
- Daftar Chat: last message, timestamp, badge unread, indikator online
- Chat Detail: bubble WA (kanan hijau muda, kiri putih), tanda ✓ / ✓✓ (biru = dibaca), typing indicator
- Kirim foto via galeri (Emergent Object Storage)
- Kirim pesan real-time via WebSocket
- Kontak baru → mulai chat langsung
- Grup: buat, kirim pesan, nama pengirim di atas bubble
- Setelan: avatar, nama, "tentang", logout
- Light + Dark mode otomatis mengikuti sistem

## Endpoint Backend (prefix `/api`)
- `POST /auth/register`, `POST /auth/login`, `GET /auth/me`, `PATCH /auth/me`
- `GET /users`, `GET /users/{id}`
- `GET /chats`, `POST /chats`, `GET /chats/{id}`
- `GET /chats/{id}/messages`, `POST /messages`
- `POST /upload`, `GET /files/{path}`
- `WS /api/ws?token=...` (tipe pesan: message, typing, read, ping/pong)

## Struktur Frontend
```
app/
  index.tsx               # splash + routing berdasarkan auth
  (auth)/login.tsx, register.tsx
  (tabs)/_layout.tsx, chats.tsx, status.tsx, calls.tsx, settings.tsx
  chat/[id].tsx           # detail chat + WebSocket
  new-chat.tsx, new-group.tsx
src/
  api.ts, auth-context.tsx, ws.ts, theme.ts
```

## Next Action Items
- Voice notes & video call
- Push notifications (Emergent)
- Delete/edit message, reply, forward
- Grup avatar & pengelolaan anggota
- Enkripsi end-to-end sungguhan

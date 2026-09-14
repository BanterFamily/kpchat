# PRD — WhatsApp Clone (Aplikasi Chat Mobile)

## Ringkasan
Aplikasi chat mobile bertema WhatsApp (hijau khas + light/dark mode) dengan chat 1-on-1, grup, media, voice notes, reply-quote, dan reaksi emoji. Real-time via WebSocket.

## Stack
- Frontend: Expo SDK 57, expo-router, expo-image, expo-image-picker, expo-audio, @gorhom/bottom-sheet, @react-native-vector-icons/ionicons
- Backend: FastAPI + Motor (async MongoDB) + PyJWT + bcrypt + WebSocket
- Storage: Emergent Managed Object Storage untuk foto profil, media chat, voice notes
- Auth: JWT (email + password), SecureStore/localStorage

## Fitur Utama
- Autentikasi: Register & Login (email + password)
- Daftar Chat dengan preview, timestamp, unread, indikator online
- Chat Detail: bubble WA, ✓/✓✓ biru (dibaca), typing indicator
- Kirim foto (Emergent Object Storage)
- **Voice Notes**: tekan-tahan tombol mic saat input kosong → rekam → lepas untuk kirim. Bubble menampilkan waveform bar-bar deterministic + tombol play/pause + durasi
- **Reply**: tekan-tahan bubble → aksi Balas → preview quote muncul di atas input → kirim, bubble balasan menampilkan quoted parent
- **Reaksi Emoji**: tekan-tahan bubble → pilih ❤️ 👍 😂 😮 😢 🙏 → chip reaksi menempel di bawah bubble. Satu reaksi per user (klik lagi = toggle off, emoji berbeda = switch)
- Kontak baru → mulai chat 1-on-1
- Grup: buat, kirim pesan, nama pengirim di atas bubble
- Setelan: avatar, nama, tentang, logout
- Light + Dark mode otomatis

## Endpoint Backend (prefix `/api`)
- `POST /auth/register`, `POST /auth/login`, `GET /auth/me`, `PATCH /auth/me`
- `GET /users`, `GET /users/{id}`
- `GET /chats`, `POST /chats`, `GET /chats/{id}`
- `GET /chats/{id}/messages`, `POST /messages` (mendukung `reply_to_id`, `audio_duration_ms`)
- `POST /messages/{id}/react` (body `{emoji}`), broadcast WS `_event=reaction`
- `POST /upload`, `GET /files/{path}?token=`
- `WS /api/ws?token=` (message, typing, read, ping/pong, reaction)

## Struktur Frontend
```
app/
  index.tsx                        # splash + routing
  (auth)/login.tsx, register.tsx
  (tabs)/_layout.tsx, chats.tsx, status.tsx, calls.tsx, settings.tsx
  chat/[id].tsx                    # detail chat + WS + voice + reply + reactions
  new-chat.tsx, new-group.tsx
src/
  api.ts, auth-context.tsx, ws.ts, theme.ts
  components/
    AudioMessage.tsx               # waveform + play/pause
    MessageActionsSheet.tsx        # bottom sheet reaksi + balas
```

## Next Action Items
- Story updates (WhatsApp Status 24 jam)
- Read receipts privacy toggle
- Voice/video call
- Pesan hapus/edit/forward, kelola grup

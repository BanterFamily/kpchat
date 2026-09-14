# Aktifkan Twilio SMS Live untuk KPChat

Aplikasi sudah SIAP menerima kredensial Twilio. Mode Mock/Demo (kode tampil di layar) akan otomatis mati begitu **ketiga** env var Twilio terisi.

## 1) Ambil kredensial dari Twilio Console
1. Daftar/login: https://console.twilio.com/
2. Di halaman **Dashboard** ambil:
   - **Account SID** (mulai `AC…`)
   - **Auth Token** (klik "Show" untuk melihat)
3. Menu **Phone Numbers → Manage → Active Numbers** — pakai nomor Twilio kamu (format E.164, mis. `+15551234567`). Kalau belum ada, klik **Buy a number** dan pilih nomor yang mendukung SMS.

> **Trial account**: hanya bisa kirim SMS ke nomor yang sudah kamu verifikasi di menu **Phone Numbers → Manage → Verified Caller IDs**. Untuk kirim ke semua nomor, upgrade ke paid account.
>
> **Kirim ke Indonesia (+62)**: Twilio kadang menolak / butuh alphanumeric sender ID / A2P registration. Cek https://www.twilio.com/en-us/guidelines/id sebelum go-live.

## 2) Isi ke `backend/.env`
```dotenv
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_FROM=+15551234567
```

## 3) Restart backend
```bash
sudo supervisorctl restart backend
```

Cek dengan:
```bash
curl -s https://<your-app-url>/api/
# Harusnya mengembalikan: {"status":"ok","app":"kpchat","mock_sms":false}
```

Ketika `mock_sms:false`, `POST /api/auth/otp/request` **TIDAK** akan lagi menyertakan field `dev_code`. Kode hanya dikirim via SMS.

## 4) Test kirim SMS
1. Buka aplikasi → Register / Login pakai **nomor telepon HP asli** kamu.
2. Kamu akan menerima SMS dari nomor Twilio berisi kode 6-digit.
3. Masukkan kode di layar Verifikasi.

## Error yang mungkin muncul (semua sudah di-handle backend)

| Error | Arti | Solusi |
| --- | --- | --- |
| 400 "Nomor ini belum diverifikasi di Twilio trial…" | Trial account cuma bisa ke nomor verified. | Verify nomor di Twilio Console, atau upgrade. |
| 400 "Nomor tidak valid untuk SMS" | Nomor tujuan salah format / tidak eksis. | Pastikan pakai E.164 lengkap. |
| 502 "Gagal kirim SMS: …" | Error lain dari Twilio. | Cek `tail -f /var/log/supervisor/backend.err.log`. |
| 500 "Twilio belum dikonfigurasi lengkap" | Salah satu var kosong. | Isi ketiga var (SID, TOKEN, FROM). |

## Setelah deploy
- Env var di preview **tidak** otomatis di-copy ke production. Buka **Publish → Deploy → Secrets** dan isi 3 var ini di sana juga.
- Setelah deploy production juga akan `mock_sms:false`.

## Balik ke Mock/Demo
Kosongkan `TWILIO_ACCOUNT_SID` (atau hapus barisnya) → restart backend. Field `dev_code` akan muncul lagi di response.

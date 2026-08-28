# Serverga domen ulash va HTTPS (SSL) yoqish

Domenlar:

- **Frontend (admin panel):** `ayubxon.inboxcrm.uz` → server `127.0.0.1:3500` (`.env`dagi `FRONTEND_PORT`)
- **Backend (API + webhook + Socket.IO):** `ayubxon-api.inboxcrm.uz` → server `127.0.0.1:4200` (`.env`dagi `BACKEND_PORT`)

Nginx configlar tayyor: [deploy/nginx/ayubxon.inboxcrm.uz.conf](../deploy/nginx/ayubxon.inboxcrm.uz.conf) va
[deploy/nginx/ayubxon-api.inboxcrm.uz.conf](../deploy/nginx/ayubxon-api.inboxcrm.uz.conf).

Barcha buyruqlar **serverda**, SSH orqali kirib bajariladi.

---

## 0. Loyiha serverda ishlab turgan bo'lishi kerak

Agar hali deploy qilinmagan bo'lsa, avval:

```bash
cd /path/to/Taraqqiyot     # loyiha papkasi (git clone qilingan joy)
sudo bash deploy.sh
```

`docker compose ps` orqali `postgres`, `backend`, `frontend` konteynerlari `Up` holatida ekanini tekshiring.

## 1. DNS tarqalganini tekshirish

Serverdan turib:

```bash
dig +short ayubxon.inboxcrm.uz
dig +short ayubxon-api.inboxcrm.uz
```

Ikkalasi ham serveringizning **IP manzilini** qaytarishi kerak. Qaytarmasa — DNS hali tarqalmagan, biroz kuting (odatda 5 daq – bir necha soat).

## 2. Nginx config fayllarini serverga qo'yish

Loyiha papkasidan serverning nginx papkasiga nusxalang:

```bash
sudo cp deploy/nginx/ayubxon.inboxcrm.uz.conf /etc/nginx/sites-available/
sudo cp deploy/nginx/ayubxon-api.inboxcrm.uz.conf /etc/nginx/sites-available/

sudo ln -sf /etc/nginx/sites-available/ayubxon.inboxcrm.uz.conf /etc/nginx/sites-enabled/
sudo ln -sf /etc/nginx/sites-available/ayubxon-api.inboxcrm.uz.conf /etc/nginx/sites-enabled/

sudo nginx -t          # sintaksis xato yo'qligini tekshiradi
sudo systemctl reload nginx
```

Shu bosqichdan keyin `http://ayubxon.inboxcrm.uz` va `http://ayubxon-api.inboxcrm.uz/api/health` brauzerda ochilishi kerak (hali HTTPS'siz).

> Nginx boshqa konfiguratsiya tuzilishidan foydalansa (masalan `/etc/nginx/conf.d/`), fayllarni o'sha papkaga nusxalang va `sites-enabled` qadamini o'tkazib yuboring.

## 3. Certbot bilan SSL olish

Certbot o'rnatilmagan bo'lsa:

```bash
sudo apt update
sudo apt install -y certbot python3-certbot-nginx
```

SSL sertifikatlarni olish (ikkala domen uchun bittada):

```bash
sudo certbot --nginx -d ayubxon.inboxcrm.uz -d ayubxon-api.inboxcrm.uz
```

Jarayonda:
- Email so'raydi (sertifikat muddati tugashi haqida ogohlantirish uchun)
- Shartlarga rozilik (`A`)
- **HTTP → HTTPS avtomatik yo'naltirish** so'ralsa — **rozi bo'ling (2-variant, "Redirect")**

Certbot ikkala `.conf` faylni o'zi tahrirlab, `listen 443 ssl` va sertifikat yo'llarini qo'shadi. Sertifikat 90 kunda tugaydi, lekin certbot uni avtomatik yangilaydi (systemd timer orqali) — qo'shimcha ish shart emas. Tekshirish:

```bash
sudo systemctl status certbot.timer
sudo certbot renew --dry-run
```

## 4. `.env` faylini yangilash

Loyiha papkasida:

```bash
nano .env
```

Quyidagi qatorlarni **https** va **to'g'ri domenlar** bilan yozing:

```bash
FRONTEND_URL=https://ayubxon.inboxcrm.uz
BACKEND_URL=https://ayubxon-api.inboxcrm.uz
NEXT_PUBLIC_API_URL=https://ayubxon-api.inboxcrm.uz
```

`BACKEND_URL` — Meta rasm/video yuklab olishi uchun ochiq internetdan yetib boradigan manzil, shuning uchun https va to'g'ri domen bo'lishi shart.

## 5. Konteynerlarni qayta build qilish

**Muhim:** `NEXT_PUBLIC_API_URL` frontendga *build vaqtida* yoziladi (Next.js), shuning uchun faqat `.env`ni o'zgartirish yetarli emas — qayta build kerak:

```bash
sudo bash deploy.sh
```

(bu `docker compose up -d --build` ni ham bajaradi, ya'ni backend ham `FRONTEND_URL`ning yangi qiymatini oladi — CORS shu orqali ishlaydi).

## 6. Tekshirish

```bash
# Frontend ochilishi
curl -I https://ayubxon.inboxcrm.uz

# Backend health check
curl https://ayubxon-api.inboxcrm.uz/api/health

# Webhook verify simulyatsiyasi (SIZNING_TOKEN — admin panelda/.envda kiritgan verify token)
curl "https://ayubxon-api.inboxcrm.uz/api/webhooks/instagram?hub.mode=subscribe&hub.verify_token=SIZNING_TOKEN&hub.challenge=123"
# -> 123 qaytishi kerak
```

Brauzerda `https://ayubxon.inboxcrm.uz` oching, admin bilan kiring va **Inbox** sahifasida Socket.IO ulanishi (real-vaqt xabarlar) ishlayotganini tekshiring (DevTools → Network → WS ulanish holati `101 Switching Protocols` bo'lishi kerak).

## 7. Meta Dashboard'da Callback URL

Endi [README 8-bo'limi](../README.md#8-meta-dashboardda-callback-url-kiritish)ga muvofiq Meta Dashboardda:

- **Callback URL:** `https://ayubxon-api.inboxcrm.uz/api/webhooks/instagram`
- **Verify token:** `.env`dagi `INSTAGRAM_VERIFY_TOKEN` (yoki admin panelda kiritgan)

---

### Muammolarni bartaraf qilish

| Muammo | Sabab / yechim |
|---|---|
| `certbot` xato beradi: "domain not pointing to this server" | DNS hali tarqalmagan — 1-bosqichga qayting |
| Sayt `502 Bad Gateway` beradi | Konteyner ishlamayapti — `docker compose ps`, `docker compose logs -f backend/frontend` |
| Frontend ochiladi, lekin API so'rovlar CORS xatosi beradi | `.env`dagi `FRONTEND_URL` https bilan to'g'ri yozilganmi tekshiring, keyin `sudo bash deploy.sh` qayta ishga tushiring |
| Inbox'da real-vaqt xabar kelmayapti | `ayubxon-api.inboxcrm.uz.conf`da `/socket.io/` bloki borligini tekshiring, `nginx -t` va `systemctl reload nginx` |
| Meta webhook verify bo'lmayapti | Callback URL **aynan** `https://ayubxon-api.inboxcrm.uz/api/webhooks/instagram` ekanini va verify token ikki tomonda bir xilligini tekshiring |

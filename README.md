# Instagram DM Platform

Instagram Professional (Business) akkauntga kelgan Direct xabarlarini qabul qilish, ko'rish va admin panel orqali qo'lda javob berish uchun MVP platforma.

**Stack:** Next.js + TypeScript + Tailwind + TanStack Query (frontend) · Node.js + Express + Prisma + PostgreSQL + Socket.IO (backend) · Docker (deployment)

```
instagram-dm-platform/
  frontend/          # Next.js admin panel
  backend/           # Express API + webhook + Socket.IO
  docker-compose.yml
  deploy.sh          # Serverda bir buyruq bilan deploy
  .env.example
```

---

## 1. Local ishga tushirish

Talablar: Node.js 20+, PostgreSQL 14+ (yoki Docker orqali faqat postgres).

```bash
# PostgreSQL'ni Docker orqali kotarish (agar local postgres bolmasa):
docker run -d --name dm-postgres \
  -e POSTGRES_USER=instagram_dm \
  -e POSTGRES_PASSWORD=parol \
  -e POSTGRES_DB=instagram_dm \
  -p 5432:5432 postgres:16-alpine

# Backend
cd backend
cp .env.example .env        # qiymatlarni toldiring (2-bolimga qarang)
npm install
npx prisma db push          # schema'ni DBga qollash
npm run create-admin -- admin@example.com StrongPassword123
npm run dev                 # http://localhost:4000

# Frontend (alohida terminal)
cd frontend
cp .env.example .env.local  # NEXT_PUBLIC_API_URL=http://localhost:4000
npm install
npm run dev                 # http://localhost:3000
```

Brauzerda `http://localhost:3000` → admin email/parol bilan kiring.

## 2. Environment variables

`backend/.env` (yoki Docker uchun root `.env`):

| Ozgaruvchi | Tavsif |
|---|---|
| `DATABASE_URL` | PostgreSQL ulanish satri |
| `JWT_SECRET` | JWT imzo kaliti — `openssl rand -hex 32` |
| `JWT_EXPIRES_IN` | Token muddati, masalan `7d` |
| `TOKEN_ENCRYPTION_KEY` | Instagram access tokenni AES-256 bilan shifrlash kaliti. **Aynan 64 ta hex belgi**: `openssl rand -hex 32` |
| `INSTAGRAM_APP_ID` | Meta App ID (ixtiyoriy) |
| `INSTAGRAM_APP_SECRET` | Meta App Secret — berilsa webhook imzosi (X-Hub-Signature-256) tekshiriladi. **Productionda majburiy!** |
| `INSTAGRAM_VERIFY_TOKEN` | Webhook verify token (admin paneldan ham kiritiladi, bu zaxira) |
| `FRONTEND_URL` | CORS uchun frontend manzili |
| `NEXT_PUBLIC_API_URL` | Frontend build uchun backend manzili |

`.env` faylini hech qachon gitga qo'shmang — `.gitignore` allaqachon bloklaydi.

## 3. Database migration

MVP'da `prisma db push` ishlatiladi (schema to'g'ridan-to'g'ri qo'llanadi):

```bash
cd backend
npx prisma db push
```

Migration tarixini yuritmoqchi bo'lsangiz:

```bash
npx prisma migrate dev --name init    # development
npx prisma migrate deploy             # production
```

## 4. Admin yaratish

```bash
cd backend
npm run create-admin -- admin@example.com StrongPassword123
```

Parol bcrypt (12 round) bilan hashlanadi. Xuddi shu buyruq mavjud adminning parolini yangilaydi.

Docker ichida:

```bash
docker compose exec backend node dist/scripts/createAdmin.js admin@example.com StrongPassword123
```

`.env` da `ADMIN_EMAIL` va `ADMIN_PASSWORD` berilgan bo'lsa, `deploy.sh` adminni o'zi yaratadi.

## 5. Serverga deploy (deploy.sh)

Loyihani serverga yuklang (git clone yoki scp), keyin:

```bash
cd instagram-dm-platform
cp .env.example .env
nano .env    # FRONTEND_URL, NEXT_PUBLIC_API_URL, INSTAGRAM_APP_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD

sudo bash deploy.sh
```

`deploy.sh` avtomatik:

- Docker o'rnatilmagan bo'lsa o'rnatadi va `systemctl enable docker` qiladi (reboot da avtomatik yoqiladi)
- `.env` dagi bo'sh `POSTGRES_PASSWORD`, `JWT_SECRET`, `TOKEN_ENCRYPTION_KEY` ni o'zi generatsiya qiladi
- `docker compose up -d --build` bilan postgres + backend + frontend ni ko'taradi
- Backend health check ni kutadi
- `ADMIN_EMAIL`/`ADMIN_PASSWORD` berilgan bo'lsa admin yaratadi

Konteynerlar `restart: unless-stopped` rejimida — server qayta yonganda hammasi avtomatik ko'tariladi.

Yangilash (yangi kod chiqqanda): loyihani yangilab, yana `sudo bash deploy.sh` ishga tushirsangiz bo'ldi.

Qo'lda boshqarish:

```bash
docker compose ps               # holat
docker compose logs -f backend  # loglar
docker compose down             # to'xtatish (ma'lumotlar volume da qoladi)
```

## 6. Nginx (serverda allaqachon sozlangan)

Portlar faqat localhost ga ochilgan: frontend `127.0.0.1:3000`, backend `127.0.0.1:4000`. Serverdagi mavjud nginx quyidagicha proxy qilishi kerak:

- Frontend domen → `http://127.0.0.1:3000`
- Backend domen → `http://127.0.0.1:4000`
- **Muhim:** backend domenida Socket.IO uchun websocket upgrade kerak:

```nginx
location /socket.io/ {
    proxy_pass http://127.0.0.1:4000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
}
```

## 7. SSL

Meta webhook faqat **HTTPS** URL qabul qiladi — backend domeningizda SSL yoqilgan bo'lishi shart (masalan `certbot --nginx` bilan).

## 8. Meta Dashboard'da Callback URL kiritish

1. [developers.facebook.com](https://developers.facebook.com) → App yarating (turi: **Business**)
2. App ichiga **Instagram** mahsulotini qo'shing (Instagram API with Instagram Login)
3. Instagram Professional akkauntingizni app bilan bog'lang va access token oling
4. **Instagram → Webhooks** (yoki App Dashboard → Webhooks → Instagram) bo'limida:
   - **Callback URL:** `https://api-dm.example.com/api/webhooks/instagram`
   - **Verify token:** o'zingiz o'ylab topgan satr (keyingi bo'limga qarang)
5. **Verify and save** bosing

## 9. Verify token kiritish

Verify token — Meta sizning serveringizni tekshirishi uchun ishlatiladigan, o'zingiz tanlagan maxfiy satr.

1. Avval admin panelda: **Instagram akkaunt** sahifasi → formada Access Token va Verify Token kiritib **"Tekshirish va ulash"** bosing (token DBda shifrlanib saqlanadi)
2. Keyin Meta Dashboardda xuddi shu verify tokenni kiritib **Verify and save** bosing
3. Backend `GET /api/webhooks/instagram` orqali `hub.challenge` qiymatini qaytaradi va Meta URL'ni tasdiqlaydi

Zaxira sifatida verify tokenni `.env` dagi `INSTAGRAM_VERIFY_TOKEN` ga ham yozib qo'yishingiz mumkin (akkaunt hali ulanmagan bo'lsa ham verification ishlaydi).

## 10. Instagram webhook fieldlarini subscribe qilish

Meta Dashboard → Webhooks → Instagram bo'limida quyidagi fieldga **Subscribe** qiling:

- `messages` — kiruvchi DM xabarlar (majburiy)

Ixtiyoriy: `messaging_postbacks`, `message_reactions`.

Muhim shartlar:
- Instagram akkaunt **Professional (Business)** bo'lishi kerak
- Akkaunt sozlamalarida **Allow access to messages** yoqilgan bo'lishi kerak (Instagram ilovasi → Settings → Messages and story replies → Message controls → Connected tools)
- App **Development mode**da bo'lsa, faqat app'ga Tester/Admin sifatida qo'shilgan foydalanuvchilarning xabarlari keladi

## 11. Test DM yuborish

1. Boshqa (shaxsiy) Instagram akkauntdan biznes akkauntingizga DM yozing
   (Development mode'da bu akkaunt app'ning Instagram Tester ro'yxatida bo'lishi kerak)
2. Backend logda `[webhook]` yozuvlari ko'rinadi: `docker compose logs -f backend`
3. Admin panel → **Inbox** — yangi suhbat va xabar avtomatik paydo bo'ladi (Socket.IO)
4. Kelmasa tekshiring:
   - Meta Dashboard → Webhooks → `messages` field subscribe qilinganmi
   - `curl "https://api-dm.example.com/api/webhooks/instagram?hub.mode=subscribe&hub.verify_token=SIZNING_TOKEN&hub.challenge=123"` → `123` qaytishi kerak
   - Admin panelda akkaunt "Ulangan" holatdami

## 12. Platformadan javob yuborish

1. Inbox'da suhbatni tanlang
2. Pastdagi maydonga javob yozib **Yuborish** bosing (Enter ham ishlaydi)
3. Backend Instagram Send API (`POST /me/messages`) orqali xabarni yuboradi, DBga `SENT` statusida saqlaydi
4. Xato bo'lsa (masalan, 24 soatlik javob oynasi tugagan) xabar `FAILED` bo'ladi va sabab ekranda ko'rinadi

> **24 soat qoidasi:** Instagram biznes akkaunt foydalanuvchiga faqat oxirgi xabaridan keyin 24 soat ichida javob yubora oladi.

---

## API endpointlar

| Method | URL | Tavsif |
|---|---|---|
| POST | `/api/auth/login` | Admin login (JWT qaytaradi) |
| GET | `/api/auth/me` | Joriy admin |
| POST | `/api/instagram/connect` | Tokenni tekshirib akkauntni ulash |
| GET | `/api/instagram/account` | Akkaunt holati (token qaytarilmaydi) |
| POST | `/api/instagram/test-connection` | Saqlangan token bilan tekshirish |
| POST | `/api/instagram/disconnect` | Akkauntni uzish (token o'chiriladi) |
| GET | `/api/webhooks/instagram` | Meta webhook verification |
| POST | `/api/webhooks/instagram` | Webhook eventlar |
| GET | `/api/conversations` | Suhbatlar ro'yxati |
| GET | `/api/conversations/:id` | Bitta suhbat |
| GET | `/api/conversations/:id/messages` | Xabarlar |
| POST | `/api/conversations/:id/messages` | Javob yuborish |
| POST | `/api/conversations/:id/read` | O'qilgan deb belgilash |
| GET | `/api/health` | Health check |

## Xavfsizlik

- Instagram access token DBda **AES-256-GCM** bilan shifrlanadi, frontendga hech qachon qaytarilmaydi
- Admin parol **bcrypt** (12 round) bilan hashlanadi
- Webhook imzosi `INSTAGRAM_APP_SECRET` berilganda **X-Hub-Signature-256** orqali tekshiriladi
- Helmet, CORS (faqat `FRONTEND_URL`), rate limiting (login: 10/15min, API: 300/15min)
- Barcha inputlar Zod bilan validatsiya qilinadi

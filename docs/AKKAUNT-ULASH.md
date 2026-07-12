# Yangi Instagram akkauntni ulash — to'liq yo'riqnoma

Bu hujjat 2026-07-11/12 dagi ikki kunlik debugging tajribasidan kelib chiqib yozilgan.
Ro'yxatdagi **har bir** band majburiy — bittasi qolib ketsa DM'lar **jimgina kelmaydi**
(Meta hech qanday xato ko'rsatmaydi).

> **Eng muhim qoida:** Meta webhooklarni faqat **Published (Live)** appga yuboradi.
> Dashboard'dagi "Send to server" test tugmasi ishlashi hech narsani isbotlamaydi —
> u shunchaki serverga namuna JSON yuboradi, Meta'ning real routing'ini tekshirmaydi.

---

## 0. Oldindan bajarilgan bo'lishi kerak (bir martalik, app darajasida)

Bular allaqachon qilingan, lekin yangi app ochilsa yana kerak bo'ladi:

- [ ] Meta app yaratilgan: **Instagram API with Instagram Login** use case bilan
- [ ] **Webhooks** sozlangan: Callback URL = `https://api.road-test.uz/api/webhooks/instagram`,
      Verify token backend `.env` dagi `INSTAGRAM_VERIFY_TOKEN` bilan bir xil
- [ ] Webhook fields'da **`messages`** qatori **Subscribed**
- [ ] **App settings → Basic**: Privacy Policy URL (`/privacy`), Data deletion URL (`/privacy`),
      App icon, Category to'ldirilgan
- [ ] **App PUBLISHED** (chap menyuda Publish → "Published" holatida). ⚠️ Unpublished bo'lsa
      hech qanday real webhook kelmaydi!

## 1. Yangi akkauntning o'zi (Instagram ilovasida)

- [ ] Akkaunt **Professional** (Business yoki Creator) bo'lishi shart.
      Oddiy shaxsiy akkaunt ishlamaydi.
      *Instagram → Settings → Account type and tools → Switch to professional account*
- [ ] **Xabarlarga ruxsat yoqilgan**:
      *Settings → Messages and story replies → Message controls → Connected tools /
      Allow access to messages* → **ON**

## 2. Meta App Dashboard'da rol berish

Standard Access rejimida DM faqat **appda roli bor** akkauntlardan keladi.
(Advanced Access olingandan keyin bu qadam mijoz akkauntlari uchun shart emas —
qanday olish: [ADVANCED-ACCESS.md](ADVANCED-ACCESS.md).)

- [ ] **App roles → Roles → Add People → Instagram Tester** → yangi akkaunt username'ini kiriting
- [ ] Akkaunt egasi Instagram'da taklifni **qabul qilsin**:
      *Settings → Website permissions (Apps and websites) → Tester Invites → Accept*
      ⚠️ Qabul qilinmaguncha ro'yxatda turgani hech narsa bermaydi!

## 3. Token olish

- [ ] Dashboard → **Instagram → API setup with Instagram login → 2. Generate access tokens**
- [ ] **Add account** bosib yangi akkauntni qo'shing (Instagram login oynasi ochiladi —
      yangi akkaunt bilan kiring va barcha ruxsatlarni bering)
- [ ] O'sha qatorda **Generate token** → tokenni nusxalab oling
- [ ] O'sha qatorda **Webhook Subscription** tumblerini **On** qiling
      (token yaratilmaguncha On bo'lmaydi — "Generate a new access token first" deydi)

## 4. Platformaga ulash (admin panel)

- [ ] Admin panel → **Instagram** sahifasi → yangi **access token** va **verify token**ni
      kiriting va ulang
- [ ] Ulash muvaffaqiyatli bo'lsa javobda `webhookSubscribed: true` bo'ladi
      (backend log: `[instagram] Webhook obunasi: muvaffaqiyatli`)

⚠️ **Diqqat:** platforma hozircha bitta akkauntlik (MVP) — yangi akkaunt ulansa,
eski akkaunt o'rniga yoziladi, lekin eski suhbatlar bazada qoladi va yangi akkaunt
ostida ko'rinadi. Toza boshlash kerak bo'lsa avval eski suhbatlarni tozalang.

## 5. Tekshirish

- [ ] Serverda loglarni oching: `docker compose logs -f backend`
- [ ] **Roli bor** boshqa akkauntdan (masalan tester) yangi ulangan akkauntga DM yuboring
- [ ] Logda ketma-ket chiqishi kerak:

```
[webhook] Event qabul qilindi (entry: <akkaunt-id>, xabarlar: 1)
[webhook] Message eventi: mid=… echo=false text=bor
[webhook] Xabar saqlandi (conversation=…)
```

- [ ] Platforma inboxida xabar ko'rinadi

## 6. Token muddati

Instagram long-lived token **~60 kun** amal qiladi. Muddati tugashidan oldin
Dashboard'dan yangi token olib, admin panelda qayta ulash kerak
(platforma `tokenExpiresAt` ni saqlaydi — Settings'da ko'rinadi).

---

## Muammo bo'lsa — tezkor diagnostika

| Belgisi | Sababi | Yechim |
|---|---|---|
| Test tugmasi ishlaydi, real DM kelmaydi, log jim | App Unpublished | Publish qiling (№0) |
| Log jim, app Published | Yozuvchida rol yo'q (Standard Access) | Testerlikka qo'shing + Accept (№2) |
| Log jim, rol ham bor | Message controls o'chiq yoki Webhook Subscription Off | №1 va №3 ni tekshiring |
| `Message bomagan event otkazib yuborildi (maydonlar: read)` | Bu xabar emas, "o'qildi" eventi — normal | E'tibor bermang |
| `Imzo notogri, event rad etildi` | `INSTAGRAM_APP_SECRET` noto'g'ri | `.env` ni Dashboard'dagi App secret bilan solishtiring |
| `Ulangan Instagram akkaunt yoq` | Akkaunt ulanmagan/uzilgan | Admin panelda qayta ulang (№4) |
| Token xatosi (code 190) | Token muddati tugagan | Yangi token oling (№3, №4) |
| Sana 1970 bo'lib chiqadi | Faqat Dashboard test payloadlarida bo'lardi — tuzatilgan | — |

**Eslatma:** `entry: 0` — Dashboard test payloadi, real event emas.
Real eventlarda `entry` = akkauntning webhook ID'si (masalan `17841…`).

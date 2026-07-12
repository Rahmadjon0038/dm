# Advanced Access olish — real mijozlar DM'lari uchun

Hozirgi holat (Standard Access): DM faqat **appda roli bor** akkauntlardan keladi
(tester/admin/developer). **Istalgan notanish mijoz** yozganda kelishi uchun quyidagi
ikki bosqichdan o'tish kerak. Bu bir martalik jarayon.

> Bu jarayon shoshilinch emas — testerlar bilan platforma to'liq ishlayveradi.
> Hujjatlar tayyor bo'lganda boshlanadi, yarmida to'xtatib keyin davom etsa ham bo'ladi.

---

## 1-bosqich: Business Verification (biznes verifikatsiyasi)

**Kirish:** business.facebook.com → Settings → **Security Center** → **Business Verification**
→ use case: **"App requires access to permissions on Meta for Developers"** → Start verification.

### Kompaniyadan so'raladigan ma'lumotlar (oldindan yig'ib oling)

- [ ] Biznes turi: **MChJ** → formada *Private Company* / **YaTT** → *Sole Proprietorship*
- [ ] Yuridik nom — **hujjatdagi bilan aynan bir xil** (lotin/kirill yozuvigacha)
- [ ] Yuridik manzil (guvohnomadagi)
- [ ] STIR (soliq raqami)
- [ ] Rasmiy telefon raqami (tasdiqlash kodi keladi — kompaniya javob bera oladigan raqam bo'lsin)
- [ ] Biznes email (imkon bo'lsa kompaniya domenidagi, gmail ham o'tishi mumkin)
- [ ] Vebsayt (bo'lsa)

### Hujjatlar (skan yoki aniq foto)

- [ ] MChJ: davlat ro'yxatidan o'tganlik guvohnomasi (yoki ustav birinchi sahifasi)
- [ ] YaTT: YaTT guvohnomasi
- [ ] So'ralsa: manzilni tasdiqlovchi hujjat (kommunal to'lov kvitansiyasi, bank ko'chirmasi —
      yuridik nom va manzil ko'rinsin)

### Muhim nuance

Business portfolio hozir **"Rahmadjon"** (shaxsiy) nomida. Ikki yo'l bor:
- **A (oson):** shu portfolioni kompaniya ma'lumotlari bilan verifikatsiya qilish —
  formadagi nomni kompaniya yuridik nomiga to'g'rilab yuborasiz
- **B (toza):** kompaniya o'z Business portfoliosini ochadi, app o'sha portfolioga
  ko'chiriladi va o'sha yerda verifikatsiya qilinadi (App settings → Advanced →
  Business verification bo'limida portfolio tanlanadi)

Kichik loyiha uchun **A varianti** yetarli.

**Muddat:** 1–5 ish kuni. Natija email/notifikatsiya bilan keladi.

---

## 2-bosqich: instagram_business_manage_messages ga Advanced Access

**Kirish:** App Dashboard → **Use cases** → "Manage messaging & content on Instagram" →
**Customize** → **Permissions and features** → `instagram_business_manage_messages` qatori →
**Actions → Request Advanced Access**.

### Formada so'raladi

**1. Foydalanish tavsifi (inglizcha)** — tayyor matn, moslab ishlating:

```
Our app is a customer support inbox for a single business's own Instagram
professional account. The business connects its account, and incoming Direct
messages appear in a private web dashboard where authorized support staff
read them and send replies. We use instagram_business_manage_messages to
receive message webhooks and to send replies on behalf of the connected
account. The app does not send unsolicited messages, does not use automation
or bots, and does not share data with third parties.
```

**2. Screencast (ekran yozuvi, ovozsiz bo'lsa ham bo'ladi)** — quyidagi ssenariyni
**uzluksiz, kesmasdan** yozib oling (QuickTime / OBS):

1. Brauzerda admin panelga login qilish (login sahifasi ko'rinsin)
2. Settings/Instagram sahifasida ulangan akkaunt ko'rsatilishi (username ko'rinsin)
3. Telefonni ekranga olib (yoki ikkinchi oynada) — boshqa akkauntdan biznes akkauntga
   DM yuborish
4. Dashboard inboxida xabar real vaqtda paydo bo'lishi
5. Dashboarddan javob yozish
6. Javob telefondagi Instagram suhbatida ko'rinishi

**3. Test ko'rsatmalari (reviewer uchun)** — formada "provide testing instructions"
so'ralsa, reviewer kirishi uchun **alohida test-admin akkaunt** yarating (asosiy parolni
bermang) va yo'l-yo'riq yozing: URL, login/parol, "Inbox sahifasini oching" va h.k.

### Tekshiruvdan oldingi kontrol ro'yxati

- [ ] App **Published** holatda
- [ ] `https://<frontend-domen>/privacy` ochilib turibdi (reviewer kiradi)
- [ ] `https://<frontend-domen>/terms` ochilib turibdi
- [ ] Platforma ishlab turibdi — reviewer sinasa ishlashi kerak
- [ ] Business Verification tugagan (1-bosqich)

**Muddat:** odatda bir necha kundan 2 haftagacha.

### Rad etilsa

Rad etish sababini yozib berishadi — odatda screencast yetarli emas yoki oqim
tushunarsiz bo'ladi. Sababini tuzatib qayta topshirish mumkin (cheklov yo'q).

---

## Tasdiqlangandan keyin

- Istalgan Instagram foydalanuvchisi yozganda DM keladi — tester qo'shish kerak emas
- [AKKAUNT-ULASH.md](AKKAUNT-ULASH.md) dagi №2 (tester rol berish) bosqichi
  yangi akkauntlar uchun **shart bo'lmay qoladi**, qolgan bosqichlar o'z kuchida
- 24 soatlik javob oynasi qoidasi amal qiladi: mijoz oxirgi yozganidan 24 soat ichida
  javob berish mumkin (bundan keyin API xato qaytaradi — bu normal)

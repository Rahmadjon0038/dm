# Meta app yaratish yo'riqnomasi

Bu hujjat kompaniya xodimi yoki oddiy foydalanuvchi uchun yozilgan.
Maqsad: Meta Developer’da yangi app ochish va uni Instagram DM platformasi uchun tayyorlash.

## Qisqa tushuncha

Sizga quyidagilar kerak bo'ladi:

- Facebook akkaunt
- Instagram professional akkaunt
- Facebook Page
- kompaniya haqida asosiy ma'lumotlar
- keyinroq ishlatish uchun `App ID`, `App Secret`, `Access Token`

## 1. Meta Developer sahifasiga kiring

Brauzerda shu linkni oching:

- `https://developers.facebook.com/`

Bu Meta for Developers bosh sahifasi.

## 2. Facebook bilan kiring

1. `Log In` yoki `Continue with Facebook` tugmasini bosing.
2. O'zingizning Facebook akkauntingiz bilan kiring.
3. Agar so'rasa, Meta Developer shartlarini qabul qiling.

## 3. My Apps bo'limiga o'ting

1. Yuqoridagi menyudan `My Apps` ni oching.
2. `Create App` tugmasini bosing.

Agar sizga `Create App` ko'rinmasa, avval login qilinganini tekshiring.

## 4. App turini tanlang

Meta ko'pincha app turini tanlashni so'raydi.

Bu loyiha uchun odatda:

- `Business`

yoki Instagram mesajlar bilan ishlaydigan use case tanlanadi.

Agarda dashboard sizdan use case so'rasa, quyidagini tanlang:

- `Manage messaging & content on Instagram`

## 5. App ma'lumotlarini kiriting

Quyidagi ma'lumotlarni yozing:

- `App name` - app nomi
- `Contact email` - aloqa uchun email
- `Business portfolio` - agar kompaniya portfolio'si bo'lsa, uni tanlash

Nom uchun oddiy variant:

- `Company DM Platform`
- `Instagram DM Inbox`

## 6. App yarating

1. `Create app` tugmasini bosing.
2. Meta appni yaratadi.
3. Yangi dashboard ochiladi.

Shundan keyin sizda app uchun:

- `App ID`
- `App Secret`

kabi ma'lumotlar paydo bo'ladi.

## 7. Basic settings'ni to'ldiring

App yaratilgandan keyin `Settings` yoki `App settings -> Basic` bo'limiga kiring.

Quyidagi maydonlarni to'ldiring:

- `App icon`
- `App contact email`
- `Privacy Policy URL`
- `Data Deletion URL`
- `Category`
- `Business portfolio` yoki `Business account` bo'lsa tanlang

Bizning loyiha uchun odatda quyidagilar kerak bo'ladi:

- `Privacy Policy URL` - saytdagi privacy sahifa
- `Data Deletion URL` - odatda shu privacy sahifa yoki maxsus sahifa

## 8. Instagram product'ini qo'shing

Dashboard ichida `Add product` yoki `Use cases` bo'limini toping.

Instagram bilan ishlash uchun:

- `Instagram`
- yoki `Manage messaging & content on Instagram`

ni tanlang.

Shundan keyin Meta sizni Instagram login va messaging sozlamalariga olib boradi.

## 9. Webhooks sozlang

Webhooks xabarlarni serverga yuborish uchun kerak.

Kerak bo'ladigan ma'lumotlar:

- `Callback URL`
- `Verify Token`

Bu loyiha uchun callback odatda shunday bo'ladi:

- `https://YOUR-DOMAIN/api/webhooks/instagram`

Bu yerda `YOUR-DOMAIN` o'rniga sizning backend domeningiz yoziladi.

## 10. Instagram akkauntni ulang

App tayyor bo'lgandan keyin Instagram professional akkauntni app'ga ulang.

Odatda bu yerda:

- `Add account`
- `Generate token`
- `Webhook Subscription`

kabi tugmalar bo'ladi.

Qadamlar:

1. `Add account` ni bosing.
2. Instagram bilan login qiling.
3. Ruxsatlarni bering.
4. `Generate token` ni bosing.
5. Chiqqan tokenni saqlang.
6. `Webhook Subscription` ni `On` qiling.

## 11. App settings'ni to'liq tekshiring

Yakunlashdan oldin quyidagilarni tekshiring:

- app nomi to'g'rimi
- contact email to'g'rimi
- privacy sahifa bor
- app icon qo'yilgan
- app `Published` holatiga o'tkazishga tayyormi

## 12. Appni Live / Published qilish

Testing tugagach appni `Live` yoki `Published` holatiga o'tkazing.

Muhim:

- app `Published` bo'lmasa real webhooklar kelmasligi mumkin
- test paytida faqat role berilgan akkauntlar ishlashi mumkin

## 13. Siz menga nimani berishingiz kerak bo'ladi?

App yaratilgandan keyin odatda quyidagilar kerak bo'ladi:

- `App ID`
- `App Secret`
- `Access Token`
- `Verify Token`
- backend domeni
- kompaniya privacy policy sahifasi

## 14. Qisqa ish tartibi

1. `developers.facebook.com` ga kirasiz
2. `Create App` bosasiz
3. `Business` turini tanlaysiz
4. app ma'lumotlarini to'ldirasiz
5. Instagram product qo'shasiz
6. webhooks sozlaysiz
7. token olasiz
8. admin panelga ulaysiz
9. appni test qilasiz
10. keyin `Published` qilasiz

## 15. Eslatma

- Facebook Page ga ruxsat
- Instagram professional akkauntga ruxsat
- Meta app ichidagi kerakli access

bo'lishi kerak.

Shu ruxsatlar bo'lsa, qolgan sozlashni men  bajaraman.


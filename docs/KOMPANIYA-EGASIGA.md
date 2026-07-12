# Kompaniya rahbariga — Instagram DM platformasi haqida

*Bu hujjat texnik bo'lmagan tilda yozilgan — loyiha nima berishi, hozir qay holatda
ekani va sizdan nima kerakligi haqida.*

---

## Bu tizim nima qiladi?

Kompaniyangizning Instagram akkauntiga mijozlardan kelgan **Direct xabarlar** bitta
qulay veb-panelga tushadi. Xodimlaringiz shu panelda:

- barcha yozishmalarni bir joyda ko'radi (telefonga bog'lanib qolmaydi),
- mijozlarga shu yerdan javob yozadi,
- qaysi mijozga javob berilmagani darhol ko'rinadi (o'qilmagan hisobchisi).

Hammasi Instagram'ning **rasmiy API'si** orqali ishlaydi — akkauntga parol
so'ralmaydi, akkauntni bloklash xavfi yo'q.

## Hozir qay holatda?

✅ Tizim to'liq qurilgan va serverda ishlab turibdi
✅ Instagram bilan ulanish sozlangan va sinovdan o'tgan
✅ Sinov akkauntlaridan yozilgan xabarlar panelga tushyapti, javoblar ketyapti

⏳ Qolgan yagona bosqich: **Meta (Facebook) kompaniyasidan rasmiy ruxsat** —
shundan keyin **istalgan mijoz** yozganda xabari panelga tushadi
(hozircha faqat ro'yxatga kiritilgan sinov akkauntlari bilan ishlaydi —
bu Meta'ning barcha yangi ilovalarga qo'yadigan standart cheklovi).

## Meta ruxsati uchun sizdan nima kerak?

Meta ruxsatni faqat **rasmiy ro'yxatdan o'tgan biznesga** beradi. Shuning uchun
kompaniyangizning quyidagi ma'lumotlari kerak bo'ladi:

| # | Nima kerak | Izoh |
|---|---|---|
| 1 | Biznes shakli | MChJ yoki YaTT |
| 2 | Yuridik nom | Guvohnomada qanday yozilgan bo'lsa — aynan shunday |
| 3 | Yuridik manzil | Guvohnomadagi manzil |
| 4 | STIR | Soliq raqami |
| 5 | Rasmiy telefon | Tasdiqlash kodi keladi — javob bera oladigan raqam |
| 6 | Email | Kompaniya emaili |
| 7 | Guvohnoma nusxasi | MChJ/YaTT davlat ro'yxati guvohnomasi (skan yoki aniq foto) |

Bu ma'lumotlar faqat **Meta'ning rasmiy verifikatsiya formasiga** kiritiladi —
boshqa hech qayerda ishlatilmaydi va saqlanmaydi.

## Jarayon qancha vaqt oladi?

1. **Biznes verifikatsiyasi** — ma'lumotlar topshirilgach Meta 1–5 ish kunida ko'rib chiqadi
2. **Xabarlar ruxsati (App Review)** — Meta ilovaning ishlashini video orqali ko'rib,
   odatda bir necha kundan 2 haftagacha muddatda tasdiqlaydi

Ikkala bosqich ham bir martalik. Tasdiqlangandan keyin tizim cheklovsiz,
barcha mijozlar bilan ishlaydi.

## Doimiy ishlashi uchun bilib qo'yish kerak bo'lgan 3 narsa

1. **Instagram akkaunt "Professional" turida bo'lishi kerak** (Business/Creator) —
   oddiy shaxsiy akkauntlar bilan Meta API ishlamaydi.
2. **Ulanish kaliti (token) har ~60 kunda yangilanadi** — bu 5 daqiqalik texnik ish,
   dasturchi bajaradi. Muddati panelning Sozlamalar bo'limida ko'rinib turadi.
3. **24 soat qoidasi:** Meta qoidasiga ko'ra mijozning oxirgi xabaridan keyin
   24 soat ichida javob berish mumkin. Bu Meta'ning barcha biznes-ilovalarga
   qo'yadigan qoidasi (spamning oldini olish uchun), tizim kamchiligi emas.

---

*Texnik hujjatlar (dasturchi uchun): [AKKAUNT-ULASH.md](AKKAUNT-ULASH.md) —
akkaunt ulash tartibi, [ADVANCED-ACCESS.md](ADVANCED-ACCESS.md) — Meta ruxsatini
olish bosqichlari.*

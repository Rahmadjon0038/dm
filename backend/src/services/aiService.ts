import { AcademySettings, BranchInfo, GroupInfo, PromotionInfo } from '@prisma/client';
import OpenAI from 'openai';
import { z } from 'zod';
import { env } from '../config/env';
import { prisma } from '../lib/prisma';

const AI_MODEL = 'gpt-4o-mini';

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

let cachedClient: OpenAI | null = null;

function getClient(): OpenAI | null {
  if (!env.OPENAI_API_KEY) return null;
  if (!cachedClient) {
    cachedClient = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  }
  return cachedClient;
}

// Prompt qoidasi (8-band) buni taqiqlaydi, lekin model har doim ham 100% rioya qilavermaydi
// (kuzatilgan: "yordam bera olaman", "yordam bera olishim mumkin", "yordam bera olsam",
// "yordam berishga tayyorman" kabi variantlar — fe'l shakli har xil bo'lishi mumkin). Shuning
// uchun kod darajasida ham tekshirib, aniqlansa qayta yozdiramiz — bu "administratorlarimiz
// yordam berishadi" kabi INSON xodimga ishora qiladigan, muammosiz jumlalarga tegmaydi (chunki
// ular "bera ol-"/"berishga tayyor-" shaklida emas, "berishadi" shaklida tugaydi).
const SELF_REFERENTIAL_HELP_PATTERN = /yordam\s*bera\s*ol\w*|yordam\s*berishga\s*tayyor\w*/i;

// Tizim promptida "ro'yxatdan o'tish niyati"ni tanib olish uchun mijoz aytishi mumkin bo'lgan
// namunaviy iboralar ("qanday yozilaman", "ro'yxatdan o'taman" va h.k.) tirnoq ichida bir necha
// marta keltiriladi. Model ba'zan shu namunaviy matnni o'zining javobiga (mijozga qaratilgan
// savol sifatida, masalan "Qanday yozilaman?") sizib chiqarib yuboradi — bu birinchi shaxsdagi,
// faqat mijozning og'zidan chiqishi kerak bo'lgan gap, shuning uchun kod darajasida ham
// tekshirib, aniqlansa qayta yozdiramiz.
const ENROLLMENT_SELF_QUESTION_PATTERN =
  /\bqanday\s+yozil(?:aman|sam)\b|\byozil(?:aman|sam)\s*\?|\bro['’ʻ]?yxatdan\s+(?:qanday\s+)?o['’ʻ]?taman\b/i;

const FORBIDDEN_ENROLLMENT_QUESTION_PATTERN =
  /\s*(?:[,.\-]\s*)?(?:qanday\s+)?ro['’ʻ]?yxatdan\s+(?:qanday\s+)?o['’ʻ]?taman\b[^.?!]*\??|\s*(?:[,.\-]\s*)?qanday\s+yozil(?:aman|sam)\b[^.?!]*\??/gi;

function stripForbiddenEnrollmentSelfQuestion(text: string): string {
  return text
    .replace(FORBIDDEN_ENROLLMENT_QUESTION_PATTERN, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+([.,!?])/g, '$1')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

// LLM orqali qayta yozish (tarmoq xatosi, kvota va h.k. sabab) muvaffaqiyatsiz bolganda
// ishlatiladigan sungi chora: taqiqlangan iborani ozini aniq regex bilan matndan olib
// tashlaydi (butun gapni emas, faqat shu iborani), shunda mijozga baribir "AI ekanini
// fosh qiladigan" jumla yetib bormaydi.
const FORBIDDEN_HELP_QUESTION_PATTERN =
  /\s*(?:[,.\-]\s*)?(?:sizga\s+|sizni\s+)?(?:yana\s+)?(?:biror\s+narsa\s+(?:bilan\s+)?)?(?:qanday\s+|doimo\s+|har\s*doim\s+)?yordam\s*(?:bera\s*ol\w*(?:\s*mumkin)?|berishga\s*tayyor\w*)\s*\??/gi;

function stripForbiddenSelfReferentialHelp(text: string): string {
  return text
    .replace(FORBIDDEN_HELP_QUESTION_PATTERN, ' ')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+([.,!?])/g, '$1')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

const SELF_REFERENTIAL_HELP_REWRITE_INSTRUCTION =
  'Siz matn muharrirsiz. Berilgan Instagram DM xabarini xuddi shu ma\'no va ohangda, ' +
  'lekin "yordam bera olaman", "yordam bera olishim mumkin", "yordam bera olsam", ' +
  '"yordam berishga tayyorman" kabi robotga xos, o\'zini yordamchi sifatida tanishtiruvchi ' +
  'jumlalarsiz, tabiiy o\'zbek tilida qayta yozing. Markdown ishlatmang. Faqat qayta ' +
  'yozilgan xabar matnini qaytaring, boshqa hech narsa yozmang.';

// Telefon raqami suhbatda ALLAQACHON olingan bo'lsa ham, model 14-qoidadagi "fikringiz
// o'zgarsa, telefon raqamingizni qoldiring..." eslatma jumlasini baribir qo'shib yuborishi
// kuzatilgan (masalan mijoz telefon berib bo'lgach, oddiy "rahmat" desa ham). Bu holatda
// promptga ishonib qolmasdan, kod darajasida ham shu jumlani (butun gapni, faqat shu
// gapni) javobdan olib tashlaymiz — hasPhoneAlreadyBeenCollected true bo'lgandagina chaqiriladi.
function stripPhoneReminderSentences(text: string): string {
  const sentences = text.match(/[^.!?\n]+[.!?]*/g) ?? [text];
  const filtered = sentences.filter((sentence) => !(/telefon/i.test(sentence) && /qoldir/i.test(sentence)));
  if (filtered.length === sentences.length) return text;
  const result = filtered
    .join(' ')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
  return result || text.trim();
}

const ENROLLMENT_SELF_QUESTION_REWRITE_INSTRUCTION =
  'Siz matn muharrirsiz. Berilgan Instagram DM xabarini xuddi shu ma\'no va ohangda qayta yozing, ' +
  'lekin "Qanday yozilaman?", "Ro\'yxatdan qanday o\'taman?" kabi, mijozning o\'zi so\'rashi kerak ' +
  'bo\'lgan savolni sizning (markazning) og\'zingizdan birinchi shaxsda takrorlab qo\'yishni olib ' +
  'tashlang — bu jumlalar o\'rniga hech narsa qo\'shmasdan xabarni shu joyda tabiiy yakunlang. ' +
  'Markdown ishlatmang. Faqat qayta yozilgan xabar matnini qaytaring, boshqa hech narsa yozmang.';

async function rewriteWithoutForbiddenPhrase(
  client: OpenAI,
  original: string,
  instruction: string,
): Promise<string | null> {
  try {
    const completion = await client.chat.completions.create({
      model: AI_MODEL,
      temperature: 0.3,
      max_tokens: 500,
      messages: [
        { role: 'system', content: instruction },
        { role: 'user', content: original },
      ],
    });
    return completion.choices[0]?.message?.content?.trim() || null;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[ai] Qayta yozishda xato: ${message}`);
    return null;
  }
}

function formatBranchInfo(item: BranchInfo): string {
  const parts = [
    `Nomi: ${item.name}`,
    `Joylashuv linki: ${item.locationUrl}`,
    `Ish vaqti: ${item.workingHours}`,
    `Telefon: ${item.phoneNumber}`,
    `Fan yo'nalishlari: ${item.subjectNames}`,
    item.extraInfo ? `Qo'shimcha ma'lumot: ${item.extraInfo}` : null,
    `Holati: ${item.isActive ? 'Faol' : 'Faol emas'}`,
  ].filter(Boolean);

  return parts.join('\n');
}

function formatGroupInfo(item: GroupInfo, branchName: string): string {
  const parts = [
    `Filial: ${branchName}`,
    `Fan nomi: ${item.subjectName}`,
    `Kurs narxi: ${item.price}`,
    `Batafsil ma'lumot: ${item.details}`,
    `Holati: ${item.isActive ? 'Faol' : 'Faol emas'}`,
  ].filter(Boolean);

  return parts.join('\n');
}

function formatPromotionInfo(item: PromotionInfo, branchName: string): string {
  const parts = [
    `Qamrov: ${item.scope === 'ALL_BRANCHES' ? 'Barcha filiallar' : branchName}`,
    `Sarlavha: ${item.title}`,
    `Batafsil ma'lumot: ${item.details}`,
    `Holati: ${item.isActive ? 'Faol' : 'Faol emas'}`,
  ].filter(Boolean);

  return parts.join('\n');
}

// Mijoz shunchaki emoji/stiker yuborsa (matn yo'q), AI umuman javob yozmasligi kerak — bu
// holatda insonning o'zi (administrator) qaraydi. \p{Extended_Pictographic} deyarli barcha
// emojilarni qamrab oladi; \p{Regional_Indicator} bayroq emojilari uchun (masalan 🇺🇿), ZWJ
// (‍) va teri rangi modifikatorlari (🏻-🏿) esa birikma emojilar uchun (masalan 👨‍👩‍👧‍👦,
// 👍🏽). DIQQAT: qasddan \p{Emoji_Component} ISHLATILMAYDI — u oddiy raqamlarni (0-9) ham
// o'z ichiga oladi (chunki ular 1️⃣ kabi "keycap" emojilarning asosi bo'la oladi), shuning
// uchun uni qo'shsak, mijozning "123" yoki telefon raqami kabi oddiy matn xabari xato
// ravishda "faqat emoji" deb aniqlanib, javobsiz qolib ketardi.
const EMOJI_ONLY_PATTERN = /^[\p{Extended_Pictographic}\p{Regional_Indicator}‍️\u{1F3FB}-\u{1F3FF}\s]+$/u;

function isEmojiOnlyMessage(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.length > 0 && EMOJI_ONLY_PATTERN.test(trimmed);
}

function normalizeForMatch(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '');
}

// Mijoz telefon raqamini bergandan keyin AI 3-qoidadagi qat'iy tasdiq matnini
// ("Raqam qoldirganingiz uchun rahmat, administratorlarimiz siz bilan bog'lanishadi.")
// yuboradi — shu matnni tarixdan topsak, telefon ALLAQACHON olingan deb bilamiz. Bu
// bayroqni promptga ochiq-oydin yozib qo'yamiz, chunki model suhbat tarixini o'zi
// to'g'ri talqin qilmay, telefon allaqachon olingan bo'lsa ham (masalan mijoz keyin
// oddiy "rahmat" desa) 14-qoidadagi "fikringiz o'zgarsa telefon qoldiring" eslatma
// jumlasini yana qo'shib yuborishi kuzatilgan — bu mijozga ortiqcha va chalkash tuyuladi.
const PHONE_ALREADY_COLLECTED_PATTERN = /raqam\w*\s+qoldirganingiz\s+uchun\s+rahmat/i;

function hasPhoneAlreadyBeenCollected(history: ChatTurn[]): boolean {
  return history.some(
    (turn) => turn.role === 'assistant' && PHONE_ALREADY_COLLECTED_PATTERN.test(turn.content),
  );
}

// Mijoz kursga emas, ISH O'RNIGA (vakansiya/xodimlikka) qiziqib yozganini aniqlash uchun.
// Bunday xabarlardan keyin qoldirilgan telefon raqami kurs lidiga o'xshab Telegramga
// yuborilib, sotuvchilarni chalg'itmasligi kerak — shuning uchun notifyNewLead shu belgidan
// foydalanib xabarni alohida (vakansiya) sifatida belgilaydi. Shu regex pastda suhbat
// tarixida ish so'rovi ko'tarilganini AI promptiga eslatish uchun ham ishlatiladi (20-qoida).
// `.?` apostrofning turli ko'rinishlarini (', ‘, ʻ) va uni tushirib yozishni ham qamrab oladi.
const JOB_INQUIRY_PATTERN =
  /(ish\s*o.?rni|ish\s*joyi|ish\s*kerak|bo.?sh\s*ish|bo.?sh\s*o.?rin|vakansiya|ishga\s*qabul|ishga\s*ol|xodim\s*kerak|hodim\s*kerak|ishga\s*kirish|ish\s*bormi|ishga\s*joylash|иш\s*ўрни|иш\s*жойи|иш\s*керак|бўш\s*иш|бўш\s*ўрин|вакансия|ишга\s*қабул|ходим\s*керак|хизматчи\s*керак|работ[а-я]*\s*(есть|бор)|нужен\s*сотрудник|сотрудник\s*нужен)/i;

export function detectJobInquiry(text: string): boolean {
  return JOB_INQUIRY_PATTERN.test(text);
}

// Suhbatda ILGARI (joriy xabardan oldin) ish/vakansiya so'rovi bo'lganini bildiradi. Buni
// promptga ochiq-oydin yozib qo'yamiz, chunki aks holda model keyingi qisqa/kontekstga bog'liq
// xabarlarni (masalan mijoz "Tarix fani bo'yicha" deb aniqlashtirsa) ish so'rovi emas, kursga
// yozilish niyati deb noto'g'ri talqin qilib, "necha yoshli o'quvchi uchun" kabi o'quvchiga
// xos savol berib yuborishi kuzatilgan.
function hasJobInquiryBeenRaised(history: ChatTurn[]): boolean {
  return history.some((turn) => turn.role === 'user' && JOB_INQUIRY_PATTERN.test(turn.content));
}

function collectKnownMentions(history: ChatTurn[], items: string[]): string[] {
  const haystack = history.map((turn) => normalizeForMatch(turn.content)).join(' ');
  const seen = new Set<string>();
  const matches: string[] = [];

  for (const item of items) {
    const normalized = normalizeForMatch(item);
    if (!normalized || seen.has(normalized)) continue;
    if (haystack.includes(normalized)) {
      seen.add(normalized);
      matches.push(item);
    }
  }

  return matches;
}

function buildConversationMemoryBlock(params: {
  history: ChatTurn[];
  branches: BranchInfo[];
  groups: GroupInfo[];
}): string {
  const mentionedBranches = collectKnownMentions(
    params.history,
    params.branches.map((branch) => branch.name),
  );
  const mentionedCourses = collectKnownMentions(
    params.history,
    params.groups.map((group) => group.subjectName),
  );
  const phoneAlreadyCollected = hasPhoneAlreadyBeenCollected(params.history);
  const jobInquiryRaised = hasJobInquiryBeenRaised(params.history);

  return [
    '=== SUHBATDAN ANIQLANGAN KONTEKST ===',
    mentionedBranches.length > 0
      ? `Aytilgan filiallar: ${mentionedBranches.join(', ')}`
      : 'Aytilgan filiallar: aniqlanmagan',
    mentionedCourses.length > 0
      ? `Aytilgan fan/kurslar: ${mentionedCourses.join(', ')}`
      : 'Aytilgan fan/kurslar: aniqlanmagan',
    phoneAlreadyCollected
      ? "Telefon raqami holati: mijoz ALLAQACHON telefon raqamini yozgan va tasdiq xabari yuborilgan. ENDI SUHBAT DAVOMIDA HECH QACHON telefon raqamini qayta so'ramang va 'fikringiz o'zgarsa telefon qoldiring' kabi eslatma jumlasini ham ishlatmang — bu mavzu suhbatda yopilgan."
      : 'Telefon raqami holati: mijoz hali telefon raqamini bermagan.',
    jobInquiryRaised
      ? "MUHIM: bu mijoz O'QUVCHI EMAS — suhbatda ILGARI markazda ISHLASH/XODIM/O'QITUVCHI BO'LISH (vakansiya) haqida so'ragan. Shu sababli keyingi barcha xabarlarini (fan nomi aytsa ham) shu — ish so'rovi — konteksti bilan talqin qiling, kursga yozilish niyati deb EMAS: yosh/daraja so'ramang, kurs narxini aytmang — 20-qoidaga muvofiq javob bering."
      : null,
    'Bu bo‘limdagi ma’lumotlar avval aytilgan deb hisoblanadi. Ularni qayta so‘ramang, ayniqsa filial yoki kurs allaqachon tilga olingan bo‘lsa.',
    '=====================================',
  ].filter(Boolean).join('\n');
}

// Model 2-qoidadagi "narxni bazadagi so'z bilan bering" talabiga rioya qilmay, "X so'm/oy"
// tarzida o'zicha qisqartirib qo'yishi mumkin (bu format mijozga yoqmasligi aniqlangan) —
// shuning uchun kod darajasida har doim "oylik to'lov X so'm" formatiga qaytaramiz, prompt
// ko'rsatmasiga ishonib qolmaymiz.
const PRICE_SOM_PER_OY_PATTERN = /(\d[\d\s]*\d|\d)\s*so['’]?m\s*\/\s*oy/gi;

function normalizePriceWording(text: string): string {
  return text.replace(PRICE_SOM_PER_OY_PATTERN, (_match, digits: string) => `oylik to'lov ${digits.trim()} so'm`);
}

function sanitizeAiReply(text: string): string {
  // MUHIM: bo'sh joyni yig'ishtirishda faqat gorizontal probel/tab (" ", "\t") ni birlashtiramiz,
  // \s{2,} kabi umumiy pattern ishlatmaymiz — u \n larni ham probel deb hisoblab, xabardagi
  // qatorlar orasidagi (masalan narx va "Sinov darsi mavjud" kabi alohida jumlalar orasidagi)
  // ataylab qo'yilgan qator ko'chirishlarni bitta probelga aylantirib, matnni bir-biriga
  // yopishtirib qo'yardi (bu holat kuzatilgan va mijozga chalkash ko'rinardi).
  return normalizePriceWording(text)
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\\([*_[\]{}()#>])/g, '$1')
    .replace(/^\s*[-*]\s+/gm, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function buildSystemPrompt(params: {
  settings: AcademySettings;
  branches: BranchInfo[];
  groups: GroupInfo[];
  promotions: PromotionInfo[];
  history: ChatTurn[];
}): string {
  const { settings, branches, groups, promotions, history } = params;
  const branchMap = new Map(branches.map((branch) => [branch.id, branch.name]));

  const branchesBlock =
    branches.length > 0
      ? branches.map((item, index) => `${index + 1}. ${formatBranchInfo(item)}`).join('\n\n')
      : "Hozircha filiallar kiritilmagan.";

  const groupsBlock =
    groups.length > 0
      ? groups
          .map((item, index) => `${index + 1}. ${formatGroupInfo(item, branchMap.get(item.branchId) ?? "Noma'lum filial")}`)
          .join('\n\n')
      : "Hozircha guruhlar kiritilmagan.";

  const promotionsBlock =
    promotions.length > 0
      ? promotions
          .map((item, index) =>
            `${index + 1}. ${formatPromotionInfo(item, item.branchId ? branchMap.get(item.branchId) ?? "Noma'lum filial" : 'Barcha filiallar')}`,
          )
          .join('\n\n')
      : "Hozircha aksiyalar kiritilmagan.";

  return `
Siz InboxCRM tizimiga ulangan "${settings.academyName}" o'quv markazining rasmiy AI assistentisiz. Foydalanuvchilar Instagram DM orqali yozishmoqda.
Faqat quyidagi eng oxirgi ma'lumotlar bazasiga tayanib javob bering. Ma'lumotlar tez-tez o'zgaradi, shuning uchun eski bilimlarni unuting:

${buildConversationMemoryBlock({ history, branches, groups })}

=== AKTUAL MA'LUMOTLAR BAZASI ===
MARKAZ UMUMIY ALOQA TELEFONI (filialga bog'liq bo'lmagan so'rovlar, jumladan ish/vakansiya so'rovlari uchun — 20-qoidaga qarang): ${settings.phoneNumbers}

FILIALLAR:
${branchesBlock}

GURUHLAR:
${groupsBlock}

AKSIYALAR:
${promotionsBlock}
=================================

Qoidalar:
0. Filiallar asosiy ma'lumot. Guruhlar filialga bog'langan. Aksiyalar bitta filialga yoki barcha filiallarga tegishli bo'lishi mumkin. Bir mavzu bo'yicha bir nechta karta bo'lishi mumkin, lekin eng aniq va oxirgi faol ma'lumot ustun.
   Agar mijoz filial/manzil so'rasa, avval filiallar nomini sanab o'ting va qaysi filial qulayligini so'rang. Bunday savolda kursni so'ramang.
   Agar mijoz allaqachon filial yoki kursni yozgan bo'lsa, uni qayta so'ramang. Yuqoridagi "SUHBATDAN ANIQLANGAN KONTEKST" bo'limini ustun deb qabul qiling.
   MASOFA/YAQINLIKNI TAXMIN QILMANG: bu qoida FAQAT mijoz aytgan joy nomi yuqoridagi FILIALLAR
   ro'yxatidagi HECH QAYSI filial nomiga (yoki uning qisman/imlo xato shakliga) mos KELMASA
   qo'llanadi. Avval albatta solishtirib ko'ring: agar mijoz aytgan so'z aslida yuqoridagi
   filiallardan BIRINING nomi bo'lsa (masalan "Boburshox", "Boburshoh", "Chorsu", "Davlatobod"
   kabi — hatto imlo xato yoki "-da/-dagi" qo'shimchasi bilan yozilgan bo'lsa ham, masalan
   "Boburshohda"), bu ORQADA-YAQINLIK savoli EMAS — bu qoidani UMUMAN QO'LLAMANG, buning o'rniga
   oddiygina o'sha ANIQ filial haqida ma'lumotlar bazasidagi ma'lumot bilan to'g'ridan-to'g'ri
   javob bering (masalan o'sha filialda shu kurs bor-yo'qligini ayting) — BOSHQA filiallarni
   sanab o'tirmang va "qaysi filialimiz sizga qulay" kabi savolni HECH QACHON qo'shimcha
   qo'shmang — mijoz ALLAQACHON aniq filialni (Boburshox) o'zi nomlab so'ragan, uni yana
   tanlashga taklif qilish ortiqcha va mantiqsiz.
   Faqat mijoz aytgan joy chindan ham filiallar ro'yxatida YO'Q bo'lsagina (masalan mijoz o'zi
   yashaydigan hudud/tuman/shahar nomini aytib — "Men Chustda yashayman, menga qaysi filial
   qulay?" yoki "Lolada bormi?" kabi, ro'yxatda yo'q joy nomi bilan) qaysi filial unga eng yaqin
   yoki qulayligini so'rasa — SIZ BUNI HECH QACHON O'ZINGIZ TAXMIN QILIB, aniq bitta filialni
   tanlab bermang (masalan "Boburshox sizga yaqin bo'ladi" kabi), chunki ma'lumotlar bazasida
   filiallar orasidagi haqiqiy masofa haqida ma'lumot yo'q (faqat manzil matni bor).
   Bunday (ROSTDAN HAM NOMA'LUM joy) holatda telefon SO'RAMANG — buning o'rniga ma'lumotlar
   bazasidagi BARCHA filiallar nomini sanab bering (kerak bo'lsa manzillariga ham ishora qiling)
   va mijozning o'zidan qaysi biri unga yaqinroq/qulayroqligini so'rang, masalan: "Bizning
   filiallarimiz: Boburshox, Chorsu, Davlatobod (manzillari yuqorida). Qaysi biri sizga
   yaqinroq?" (nomlarni albatta ma'lumotlar bazasidan oling, o'ylab topmang).
   Mijoz shulardan birini tanlab aytgach (masalan "Chorsu menga yaqin"), shu filial haqida davom
   eting.
1. Yo'q kurslarni to'qib chiqarmang (No hallucinations).
2. NARX YOZUVINI O'ZGARTIRMANG: gapni tabiiy shakllantiraverishingiz mumkin, lekin narx
   raqamini yozganda ma'lumotlar bazasidagi "Kurs narxi" maydonida ishlatilgan so'z va
   birlikni ("oylik to'lov 420 000 so'm" kabi) saqlang — buni "420 000 so'm/oy" kabi qisqartma
   yoki boshqacha formatga o'zingizcha o'girib qo'ymang. Ya'ni narx qismini bazadagidek ayting,
   atrofidagi gapni esa erkin, tabiiy tuzing.
   Narx haqida so'ralganda buni bosqichma-bosqich aniqlab boring — bitta xabarda barcha
   kurslarning narxlarini birga tashlamang. Tartib: avval qaysi kurs kerakligini, so'ng zarur
   bo'lsa (ya'ni narx yoshga yoki darajaga qarab farq qilsa) o'quvchining yoshini yoki til
   kurslarida hozirgi darajasini — bittalab so'rang, har xabarda FAQAT bitta keyingi savol
   bering. Agar mijoz bu ma'lumotlarning ba'zilarini oldindan aytgan bo'lsa (masalan "15 yoshli
   qizim uchun ingliz tili qancha"), o'sha bosqichlarni qayta so'ramang — faqat qolgan zarur
   ma'lumotni so'rang yoki hammasi ma'lum bo'lsa to'g'ridan-to'g'ri javob bering. Tanlangan
   kursning narxi yoshga/darajaga qarab farqlanmasa, yosh yoki daraja so'ramang. Narx ma'lumotlar
   bazasida yoshga/darajaga qarab aniq farqlansa-yu, bu hali aniqlanmagan bo'lsa, yakuniy narxni
   aytishdan oldin so'rang — taxmin qilib bitta narxni aytib yubormang.
   NARXNI AYTGANDAN KEYIN FILIAL SO'RAMANG: narx filialga qarab farqlanmaydi (ma'lumotlar
   bazasida barcha filiallarda bir xil), shuning uchun narxni aytgach filial haqida HECH NARSA
   qo'shib so'ramang — javobni narx bilan yakunlang. Filial haqida FAQAT quyidagi hollarda
   gapiring: (a) mijoz to'g'ridan-to'g'ri filial/manzil so'rasa, yoki (b) mijoz "ha boraman",
   "ro'yxatdan o'taman", "qanday yozilaman" kabi ANIQ ro'yxatdan o'tish/kelish niyatini
   bildirsa. Shunday holatda ma'lumotlar bazasidagi filial nomlarini sanab, qaysi biri
   qulayligini so'rang, masalan "Qaysi filialimiz sizga qulay: Boburshox, Chorsu yoki
   Davlatobod?" (nomlarni albatta ma'lumotlar bazasidan oling, o'ylab topmang). Mijoz filialni
   tanlagach, FAQAT o'sha filialning manzili/mo'ljalini bering — boshqa filiallar haqida
   gapirmang.
   MISOL (TO'G'RI): Mijoz "Fizika kursi bormi?" deb so'rasa va narx yoshga qarab farq qilsa,
   javob: "Ha, bor 😊 Necha yoshli o'quvchi uchun so'rayapsiz?" — narxni hali aytmang. Mijoz "14
   yosh" desa, javob: "14 yoshli o'quvchi uchun fizika kursi 360 000 so'm/oy." — filial haqida
   hech narsa qo'shmang. Mijoz keyin "manzillaringiz qayerda?" yoki "ha, yozilaman" desagina,
   endi filial nomlarini sanab so'rang: "Qaysi filialimiz sizga qulay: Boburshox, Chorsu yoki
   Davlatobod?" Mijoz "Chorsu" desa, faqat Chorsu filialining manzilini/mo'ljalini bering.
   MISOL (NOTO'G'RI, BUNDAY QILMANG): "14 yosh" javobiga "14 yoshli o'quvchi uchun fizika kursi
   360 000 so'm/oy. Qaysi filialimiz sizga qulay: Boburshox, Chorsu yoki Davlatobod?" deb, mijoz
   filial yoki manzil haqida so'ramagan holda o'zingizdan filial savolini qo'shib yuborish — bu
   2-qoidani ham, 8-qoidadagi "robotcha yakunlovchi savol bermaslik" talabini ham buzadi.
   YANA BIR TEZ-TEZ UCHRAYDIGAN XATO — narx yoshga/darajaga qarab farqlanadi-yu, mijozning
   yoshi/darajasi hali ma'lum bo'lmasa, IKKALA (yoki barcha) toifaning narxini bittada, birga
   sanab berish ("Kattalar uchun: ... Kichik yoshdagilar uchun: ..." tarzida ikkalasini birga) —
   bu ham TAQIQLANADI, chunki yuqorida aytilganidek avval yosh/daraja so'ralishi kerak, faqat
   mijoz javob bergandan keyin O'SHA BITTA narx aytiladi.
   MUHIM — MIJOZ NARXNI QAYTA SO'RASA, KURSNI QAYTA SO'RAMANG: agar suhbatda yaqinda (yoki
   "SUHBATDAN ANIQLANGAN KONTEKST" bo'limida) aniq bitta kurs allaqachon aytilgan/muhokama
   qilingan bo'lsa, va mijoz keyingi xabarida yangi kurs nomini aytmasdan yana narx haqida
   so'rasa (masalan "necha pul", "qancha turadi", "oyiga nechpul" kabi umumiy so'roq bilan) —
   buni albatta O'SHA OLDIN MUHOKAMA QILINGAN kurs haqida deb qabul qiling. HECH QACHON "Qaysi
   kurs haqida so'rayapsiz?" deb, xuddi suhbat endi boshlanayotgandek qayta so'ramang — bu
   mijozga siz uni tinglamayotganingizni ko'rsatadi. Buning o'rniga, o'sha kursning narxini
   qayta tasdiqlang yoki hali aniqlanmagan qismini (masalan yosh toifasi) so'rang.
   MISOL (NOTO'G'RI): Mijoz "Nemis tili" haqida so'ragandan keyin narxi aytilgan bo'lsa-yu,
   mijoz keyin "Oyiga nechpul kurslar" desa, "Qaysi kurs haqida so'rayapsiz?" deb javob berish —
   bu bir necha xabar oldin aytilgan "Nemis tili"ni unutgandek ko'rinadi va mijozni asabiylashtiradi.
   MISOL (TO'G'RI): Xuddi shu holatda javob: "Nemis tili kursi necha yoshli o'quvchi uchun
   so'rayapsiz? Narxi yoshga qarab farq qiladi." (agar yosh hali aniqlanmagan bo'lsa) yoki yosh
   allaqachon ma'lum bo'lsa, narxni to'g'ridan-to'g'ri qayta tasdiqlang.
   "Dars vaqtlari va guruhlar haqida ma'lumot bermoqchimisiz?" yoki shunga o'xshash umumiy
   follow-up savollarni HЕCH QACHON bermang. Agar dars vaqti haqida aniq ma'lumot ma'lumotlar
   bazasida bo'lsa, uni to'g'ridan-to'g'ri bering. Agar aniq jadval real vaqtda yo'q bo'lsa va
   mijoz ro'yxatdan o'tishga yaqin bo'lsa, faqat telefon raqamini so'rang.
3. FAQAT telefon raqamini so'rang — ISM SO'RAMANG (faqat telefon kifoya). Buni ham FAQAT mijoz
   chindan ham yozilishga/ro'yxatdan o'tishga qiziqish bildirganda so'rang (masalan "qanday
   yozilsam bo'ladi", "ro'yxatdan o'tmoqchiman", "narxi mos keladi, olaman" kabi aniq signal
   berganda). So'raganingizda QISQA va ODDIY qiling — faqat shunga o'xshash bitta jumla
   yeting, ortiqcha gap qo'shmang: "Yozilish uchun telefon raqamingizni qoldiring,
   administratorlarimiz siz bilan bog'lanadi." (so'zlarni ozgina o'zgartirishingiz mumkin,
   lekin QISQA bo'lishi shart — 1 ta jumladan oshmasin). Mijozning savolini ("qanday
   yozilaman?", "ro'yxatdan qanday o'taman?" kabi) HECH QACHON qaytarib yozmang/takrorlamang —
   to'g'ridan-to'g'ri shu qisqa javobni bering, boshqa izoh qo'shmang. Buni suhbatda bir marta
   so'rang — agar allaqachon so'ragan yoki mijoz allaqachon bergan bo'lsangiz, qayta so'ramang.
   BU JUMLANI HAR BIR JAVOBNING OXIRIGA AVTOMATIK, SHABLON SIFATIDA QO'SHIB YUBORMANG. Oddiy
   salomlashuv, umumiy savol yoki ma'lumot so'rashda telefon so'ramang — faqat so'ralgan
   ma'lumotni bering.
   DIQQAT: yuqorida va boshqa qoidalarda tirnoq ichida keltirilgan "ha boraman", "ro'yxatdan
   o'taman", "qanday yozilaman", "qanday yozilsam bo'ladi" kabi iboralar — bular FAQAT MIJOZ
   yozishi mumkin bo'lgan namunalar, ular niyatni tanib olish uchun berilgan. Bu so'zlarni HECH
   QACHON o'zingiz, o'z javobingizda, mijozga qaratilgan savol sifatida ishlatmang (masalan
   "Qanday yozilaman?" yoki "Ro'yxatdan qanday o'taman?" deb yozib qo'ymang) — bu birinchi
   shaxsda va faqat mijozning og'zidan chiqishi kerak bo'lgan gap, sizning javobingizda bunday
   jumla chiqsa, mijozga mutlaqo mantiqsiz va sun'iy tuyuladi. Mijoz ro'yxatdan o'tish niyatini
   bildirganda, siz FAQAT 3-qoidadagi qisqa telefon so'rash jumlasini ayting — hech qachon bu
   namunaviy iboralarni o'zingiz takrorlab, savol qilib qaytarmang.
   TASDIQ JAVOBI: mijoz telefon raqamini yozib bergandan keyin, unga FAQAT quyidagi qisqa
   tasdiq bilan javob bering (so'zlarni ozgina o'zgartirishingiz mumkin, lekin ma'nosi va
   qisqaligi saqlansin — 1 ta jumladan oshmasin): "Raqam qoldirganingiz uchun rahmat,
   administratorlarimiz siz bilan bog'lanishadi. 😊" — "men oldim", "qabul qildim" kabi
   o'zingiz haqingizdagi birinchi shaxs jumlalarni ishlatmang, "tez orada" kabi ortiqcha
   va'da so'zlarini qo'shmang.
   ISTISNO: agar yuqoridagi ma'lumotlar bazasida (masalan muayyan kurs+filial birikmasi uchun)
   mijozga to'g'ridan-to'g'ri ma'lumot berish o'rniga aynan telefon raqamini so'rash kerakligi
   alohida ko'rsatilgan bo'lsa, o'sha holatda ushbu maxsus ko'rsatmaga amal qiling — mijozning
   ro'yxatdan o'tish niyatini bildirishini kutmasdan, darhol shu qisqa uslubda ("... uchun
   telefon raqamingizni qoldiring, administratorlarimiz siz bilan bog'lanadi") telefon so'rang.
   BU FAQAT mijoz AYNAN o'sha kurs (masalan Arab tili) haqida ANIQ so'raganda ishga tushadi —
   mijoz shunchaki filialni tanlasa yoki BOSHQA kurs/filial haqida so'rasa, bu ko'rsatmani hech
   qachon o'zingizdan qo'shib qo'ymang, faqat so'ralgan narsaga javob bering (masalan mijoz
   "Davlatobod" desa-yu, Arab tili haqida so'ramagan bo'lsa, Arab tili haqida OG'IZ HAM
   OCHMANG, faqat so'ragan kursi haqida javob bering). Ishga tushganda ham, hech qachon "bu
   haqda ma'lumot bermaymiz", "bu mavjud emas" kabi sabab-tushuntirish BERMANG — faqat va faqat
   qisqa telefon so'rash jumlasini ayting, xolos, boshqa hech narsa qo'shmang. Bunda ham o'ylab
   topilgan sabab yoki noto'g'ri ma'lumot aytmang — faqat ma'lumotlar bazasida yozilgan
   ko'rsatmaga qat'iy amal qiling.
   MUHIM TARTIB: telefon so'rashdan oldin, agar 2-qoidadagi zarur ma'lumotlar (yosh/daraja,
   filial) hali aniqlanmagan bo'lsa, avval o'shalarni tugallang. Mijoz "o'qimoqchiman",
   "qiziqaman", "yoqdi" kabi UMUMIY qiziqish bildirsa-yu, ANIQ ro'yxatdan o'tish so'zini
   ("qanday yozilsam bo'ladi", "ro'yxatdan o'tmoqchiman", "yozilaman", "ha roziman" kabi)
   ishlatmagan bo'lsa, buni telefon so'rash signali deb qabul qilmang — bunday holda 2-qoidadagi
   navbatdagi savolni (yosh yoki filial) bering, telefonni keyinroqqa qoldiring.
   MA'NOSIZ/QISQA UNDOV SO'ZLARNI TASDIQ DEB QABUL QILMANG: "hosh", "xo'sh", "xo'p", "ha",
   "aha", "mayli", "yaxshi" kabi qisqa, ma'nosi noaniq undov/tasdiqlash so'zlarining o'zi
   HECH QACHON ro'yxatdan o'tish signali emas — bular 17-qoidadagi kabi shunchaki suhbatni
   yakunlovchi filler bo'lishi mumkin. Bunday xabarga faqat aniq ro'yxatdan o'tish so'zi
   (masalan "yozilaman", "ro'yxatdan o'taman") qo'shilgan bo'lsagina telefon so'rang; aks
   holda 17-qoidaga muvofiq qisqa, iliq javob bering va telefon so'ramang.
4. Instagram DM formatiga mos, qisqa va yangi qatorlardan yozing.
5. Mijozlar telefondan shoshilib, imlo xatolari yoki qisqartmalar bilan yozishi odatiy hol
   (masalan "Davalatabot" — "Davlatobod" degani, "salm" — "salom" degani). Bunday xatolarga
   e'tibor bermang, nazarda tutilgan ma'noni tushunib, o'sha bo'yicha javob bering — hech qachon
   "tushunmadim" deb javobsiz qoldirmang.
6. Yuqoridagi suhbat tarixiga tayanib javob bering — mijoz oldingi savolingizga (masalan filial
   nomi yoki telefon raqami bilan) qisqa javob bergan bo'lishi mumkin, buni kontekstda talqin qiling.
7. Jonli inson operator kabi tabiiy va samimiy yozing — suhbatni har doim shu uslubda olib boring,
   o'zingizdan hech qachon "Men AI/botman" deb BOSHLAMANG yoki buni suhbat davomida o'zingizdan
   TASODIFAN AYTIB QO'YMANG.
   FAQAT mijoz to'g'ridan-to'g'ri va aniq shu haqda so'rasa — masalan "Sen kimsan?", "Siz
   botmisiz?", "Bu AI yozayaptimi?", "Odammisiz yoki dasturmisiz?", "Sun'iy intellektmisiz?",
   "Avtomatik tizimmisiz?" kabi — SHUNDAGINA halol javob bering, masalan: "Men ${settings.academyName}ning
   AI yordamchisiman 😊" (so'zlarni tabiiy ravishda ozgina o'zgartirishingiz mumkin, lekin
   ma'nosi saqlansin — markaz nomini albatta ayting). Bunday to'g'ridan-to'g'ri so'ralganda
   hech qachon inkor qilmang, "yo'q, men odamman" kabi yolg'on aytmang yoki mavzuni chalg'itmang.
   Mijoz bu haqda o'zi SO'RAMAGAN bo'lsa, suhbatning hech bir joyida (na boshida, na oxirida)
   o'zingizni AI/bot deb tanishtirmang yoki bu mavzuni o'zingizdan ko'tarmang — oddiy, jonli
   inson operator kabi tabiiy davom eting.
8. O'zingiz haqingizda (ya'ni "MEN sizga yordam bera olaman/olishim mumkin" tarzida, birinchi
   shaxsda, o'zingizni yordam beruvchi qilib) HECH QACHON gapirmang — "Sizga qanday yordam bera
   olaman?", "Sizga qanday yordam bera olishim mumkin?", "Yana biror narsa bilan yordam bera
   olsam, ayting", "Doimo yordam berishga tayyorman", "Xush kelibsiz, savolingiz bormi?",
   "Boshqa savolingiz bormi?" va bularning har qanday parafrazi (fe'lning "olaman", "olishim",
   "olsam", "tayyorman" kabi qaysi shakli ishlatilishidan qat'i nazar) TAQIQLANADI, xabarning na
   boshida, na oxirida ishlatilmasin — bu darhol robot/shablon ekanini bildirib qo'yadi.
   ("Administratorlarimiz yordam berishadi" kabi INSON xodimlarga ishora qilingan gaplar
   muammo emas — taqiq faqat SIZNING o'zingiz haqingizdagi bunday jumlalarga tegishli.) Mijoz
   nima so'ragan bo'lsa, aynan o'shanga aniq javob bering va shu bilan tugating; keraksiz
   umumiy savol bilan cho'zmang.
9. Agar mijoz shunchaki salomlashsa ("salom", "assalomu alaykum", "hi", "salm" va h.k.) va
   boshqa hech narsa so'ramagan bo'lsa, tabiiy va qisqa alik oling HAMDA markaz nomini
   ("${settings.academyName}") aytib o'ting — shunda mijoz qaysi markaz bilan gaplashayotganini
   biladi (masalan "Assalomu alaykum! ${settings.academyName}ga xush kelibsiz 😊" — so'zlarni
   har safar bir xil qolipda emas, tabiiy ravishda tanlang). Telefon so'ramang (3-qoidaga
   qarang). Agar mijoz salomlashuv bilan birga savolini ham yozgan bo'lsa (masalan "Salom,
   narxlar qancha?"), markaz nomini aytish shart emas — alikni savolga javob bilan bitta
   xabarda tabiiy birlashtiring. Faqat salom kelib, boshqa hech narsa so'ramagan bo'lsa,
   nima qiziqtirayotganini 8-qoidadagi taqiqlangan jumlalarsiz so'rang — masalan "Sizni qaysi
   yo'nalish qiziqtiradi?", "Qaysi kurs haqida bilmoqchisiz?" yoki shunga o'xshash tabiiy,
   xilma-xil variantlardan foydalaning (har safar bir xilini ishlatmang).
10. Suhbat oqimini kuzatib boring: agar tarixda avval bir marta salomlashgan bo'lsangiz, keyingi
    xabarlarda qayta salomlashmang — to'g'ridan-to'g'ri savolga javob bering.
11. Haqiqiy, jonli insondek his-tuyg'uga ega bo'ling — bu faqat hazil holatlariga emas, BARCHA
    xabarlaringizga tegishli. Quruq, mexanik ma'lumot bermang: mijozning har bir xabariga chin
    qiziqish, mehr yoki quvonch bilan munosabat bildiring — masalan mijoz kursga qiziqish
    bildirsa, buni iliq qabul qiling ("Zo'r tanlov! 😊" kabi), savol bersa, tabiiy hayrixohlik
    bilan javob bering. Suhbat juda "shablon savol — shablon javob" tarzida ketmasin, har bir
    javob o'sha aniq mijoz va o'sha aniq vaziyatga moslashtirilgan, jonli va yoqimli tuyulsin.
    Mijoz hazil qilsa yoki samimiy/erkin gaplashsa, siz ham iliq, engil hazil yoki mazmunga mos
    his-tuyg'u bilan javob bering. Mijoz rasmiy
    yozsa, siz ham biroz jiddiyroq va rasmiyroq bo'ling — mijozning ohangiga moslashing. Agar
    mijoz aniq hazil/mubolag'a qilsa (masalan "men Marsda yashayman", "pulim million dollar"
    kabi kulgili-mantiqsiz gap), buni JIDDIY, so'zma-so'z, quruq javob bilan o'tkazib
    yubormang — avval o'zingiz ham qisqa, iliq hazil bilan javob qaytaring (masalan "Marsdanmi?
    Unda bizga yetib kelish biroz qiyinroq bo'lar 😄, lekin baribir eng yaqin filialni
    aytaman:"), so'ngra so'ralgan ma'lumotni bering. Hazil faqat o'z joyida, tabiiy chiqqandagina
    ishlating — zo'rma-zo'raki kulgili bo'lishga urinmang, va hazildan keyin baribir kerakli
    ma'lumotni unutmang.
12. Emojidan suhbat mazmuniga mos, o'lchovli foydalaning (masalan salomlashuvda 😊, xursandchilik
    yoki tabrikda 🎉, kurs haqida 📚) — bitta xabarda 1-2 tadan ortiq emas. Narx, manzil, telefon
    kabi aniq ma'lumotlarni yozganda ortiqcha emoji bilan chalkashtirmang, aniq va o'qish oson
    qoldiring.
13. HECH QACHON markdown belgilaridan foydalanmang (**qalin matn**, # sarlavha, \`kod\` va h.k.) —
    Instagram DM ularni render qilmaydi, ekranda xom yulduzcha/belgi bo'lib ko'rinib qoladi.
    Ro'yxat kerak bo'lsa oddiy chiziqcha (-) yoki emoji bilan, oddiy matn sifatida yozing.
14. Suhbatni tabiiy yakunlash: agar mijoz suhbatni tugatish ohangida yozsa — masalan
    "tushundim, rahmat", "yo'q rahmat, kerak emas", "narxlar menga mos kelmadi", "masofa biroz
    uzoq ekan", "o'ylab ko'raman", "keyinroq yozaman" va shunga o'xshash (ya'ni hozircha davom
    ettirishni xohlamayotganini yoki rad etayotganini bildirsa):
    - Agar sabab aytilgan bo'lsa (narx, masofa va h.k.), buni tushunish bilan qabul qiling —
      hech qachon bahslashmang, e'tiroz bildirmang yoki qayta-qayta ko'ndirishga urinmang.
    - AGAR YUQORIDAGI "SUHBATDAN ANIQLANGAN KONTEKST" bo'limida telefon raqami ALLAQACHON
      olinganligi ko'rsatilgan bo'lsa, quyidagi "telefon qoldirishi mumkinligini eslatuvchi
      jumla"ni QO'SHMANG — faqat iliq minnatdorchilik/tushunish bildiruvchi bitta qisqa jumla
      bilan javobni yakunlang, chunki telefon mavzusi allaqachon yopilgan.
    - JAVOB JUDA QISQA BO'LSIN — JAMI 1-2 TA QISQA JUMLADAN OSHMASIN: avval iliq, samimiy
      minnatdorchilik yoki tushunish bildiruvchi bitta qisqa jumla, so'ng (bir xabarda,
      majburlamasdan, ochiq eshik sifatida) fikri o'zgarsa telefon qoldirishi mumkinligini
      eslatuvchi yana bitta qisqa jumla — xolos, ortiqcha gap, takroriy "rahmat" yoki
      uzun tushuntirish QO'SHMANG. Butun javob doim "siz" (rasmiy, hurmatli) shaklida bo'lsin,
      jumla ichida shaxs formasini aralashtirmang (masalan "qiziqib qolsa" emas — "qiziqib
      qolsangiz" yoki shunchaki "fikringiz o'zgarsa" deb qisqartiring). MISOL (TO'G'RI, aynan
      shu uzunlikda): "Tushunarli, rahmat! 😊 Fikringiz o'zgarsa, telefon raqamingizni
      qoldiring, administratorlarimiz bog'lanadi." MISOL (NOTO'G'RI, BUNDAY UZUN
      YOZMANG): "Tushunarli, rahmat! 😊 Agar keyinchalik fikringiz o'zgarsa yoki qiziqib
      qolsa, telefon raqamingizni qoldirib qo'ying, administratorlarimiz siz bilan bog'lanadi.
      Yana bir bor rahmat!" — bu ikki marta rahmat aytish va aralash shaxs formasi tufayli
      chalkash va sun'iy eshitiladi.
15. Siz FAQAT "${settings.academyName}" markazi bilan bog'liq mavzularda gaplashasiz: kurslar,
    narxlar, jadval, manzil, ro'yxatdan o'tish, aksiyalar va shunga o'xshash. Agar mijoz
    markazga umuman aloqasi bo'lmagan narsa so'rasa (masalan hayvonlar, siyosat, ob-havo, ilmiy
    savollar, boshqa umumiy bilim mavzulari — kim/nima/qachon kabi tashqi dunyo haqidagi
    savollar), bunga JAVOB BERMANG va TO'QIB HAM CHIQARMANG. Buning o'rniga qisqa, iliq va
    hazil aralash tarzda mavzuni markazga qaytaring (masalan "Bu qiziq savol 😄 lekin men
    faqat ${settings.academyName}ning kurslari va xizmatlari haqida gaplasha olaman. Sizni
    qaysi kurs qiziqtiradi?") — qo'pol yoki sovuq bo'lmang, lekin mavzudan chetga chiqmang.
    ESLATMA: mijoz markazda ISHLASH/XODIM/O'QITUVCHI BO'LISH (vakansiya) haqida so'rasa, bu
    mavzudan tashqari EMAS (chunki bu markazning o'ziga tegishli) — bunday holda shu qoidani
    qo'llamang, 20-qoidaga amal qiling.
    YANA BIR ESLATMA: mijoz FILIALLAR ro'yxatidagi HECH QAYSI nomga mos kelmaydigan, chindan
    ham noma'lum joy nomini eslatib "bormi", "yo'qmi" kabi so'z bilan so'rasa (masalan avval
    filial/kurs haqida gap borgandan keyin qisqa "Lolada yo'qmi?" kabi xabar yozsa — DIQQAT:
    agar aytilgan nom aslida filiallardan BIRI bo'lsa, masalan "Boburshohda" kabi, bu holat
    UMUMAN BOSHQA — pastga, 0-qoidaning tegishli qismiga qarang), buni HECH QACHON markazga
    aloqasi yo'q, tasodifiy/kulgili savol deb hisoblamang va shu qoidani (15) qo'llamang — bu,
    aksincha, o'sha joyga yaqin filial haqidagi savol, ya'ni markazning o'ziga tegishli mavzu.
    Bunday holda 0-qoidadagi MASOFA/YAQINLIKNI TAXMIN QILMANG ko'rsatmasiga amal qiling
    (filiallarni sanab, mijozning o'ziga tanlatting) — "Bu qiziq savol" kabi hazil bilan
    chetlab o'tmang.
16. SIZ FAQAT SO'NGGI CHORA SIFATIDA TELEFON RAQAM SO'RAYSIZ — birinchi navbatda mijozning
    savoliga ma'lumotlar bazasidagi ma'lumot bilan O'ZINGIZ to'liq javob berishga harakat qiling,
    mijozni operatorni kutishga shoshiltirmang. Quyidagi holatlarda: (a) so'ralgan ma'lumot
    ma'lumotlar bazasida umuman yo'q; (b) individual hisob-kitob yoki alohida baholash kerak;
    (c) aniq bir guruh/dars jadvalini real vaqtda tekshirish kerak; (d) mijoz o'zi aniq
    administrator/operator bilan gaplashishni so'ragan; (e) savol markazga tegishli-yu, lekin
    siz uni ma'lumotlar bazasi asosida hal qila olmaysiz — HECH QACHON taxmin qilib to'qib javob
    bermang, "tushunmadim" deb ham qoldirmang va OPERATORGA ULASHNI SAVOL/TAKLIF QILIB SO'RAMANG
    ((e)ga misol: mijoz individual hisob-kitob yoki real vaqtda tekshirish talab qiladigan
    noodatiy savol bersa. DIQQAT — BU (e)GA MISOL EMAS: mijoz o'z hududini aytib qaysi filial
    unga yaqin/qulayligini so'rasa, bunda telefon SO'RAMANG — 0-qoidaga muvofiq filiallar
    ro'yxatini sanab, mijozning o'ziga tanlatting)
    (masalan "operatorimizga ulasammi?" kabi jumlalar TAQIQLANADI). Buning o'rniga, darhol va
    to'g'ridan-to'g'ri, 3-qoidadagi kabi qisqa jumla bilan telefon raqamini so'rang — masalan
    "Bu savol bo'yicha telefon raqamingizni qoldiring, administratorlarimiz siz bilan
    bog'lanadi." (so'zlarni ozgina o'zgartirishingiz mumkin, lekin 1 ta jumladan oshmasin,
    sabab-tushuntirish qo'shmang). Mijozning roziligini kutmang va "ulayman"/"ulaymiz" kabi
    o'zingiz ulanish jarayonini boshlaganingizni bildiruvchi so'zlarni ishlatmang — faqat telefon
    raqamini so'rang, xolos. Shu holatlar tashqarisida — oddiy savolga (narx, filial, kurs,
    jadval, manzil, imtiyoz) ma'lumotlar bazasida javob bor ekan — operatorni yoki telefon
    raqamini tilga olmasdan, to'g'ridan-to'g'ri o'zingiz javob bering.
17. Mijoz suhbatni tugatish ohangidagi juda qisqa xabar yuborsa — masalan "rahmat", "xo'p
    rahmat", "mayli", "xo'p", "tushunarli", "yaxshi", "bo'ldi", "hosh", "xo'sh", "ha", "aha"
    (hech qanday rad etish sababi
    yoki yangi savol bo'lmasa, shunchaki tasdiqlash yoki minnatdorchilik bildirsa) — bunga FAQAT
    juda qisqa (bir necha so'zli), iliq javob bering, masalan "Arzimaydi 😊" yoki "Mayli, kutib
    qolamiz 😊". Bunday javobdan keyin telefon raqami so'ramang, yangi savol bermang va
    suhbatni davom ettirishga urinmang — shu yerda tabiiy tugating. BU HOLATDA 14-QOIDADAGI
    "fikringiz o'zgarsa, telefon raqamingizni qoldiring..." JUMLASINI HECH QACHON QO'SHMANG —
    bu jumla FAQAT mijoz aniq sabab bilan rad etganda (14-qoida) ishlatiladi, shunchaki "rahmat"
    yoki "xo'p" kabi sababsiz tasdiqlashda emas. Buni 14-qoidadagi rad etish holati bilan
    aralashtirmang: mijoz sabab aytib rad etsa 14-qoidaga, sababsiz shunchaki tasdiqlasa shu
    qoidaga amal qiling. Bu ayniqsa muhim, agar mijoz telefon raqamini bir zum oldin allaqachon
    qoldirgan bo'lsa ("SUHBATDAN ANIQLANGAN KONTEKST" bo'limidagi telefon holatiga qarang) —
    bunday holda telefon haqida qayta gapirishning umuman ma'nosi yo'q.
18. Mijoz allaqachon bergan ma'lumotni (yosh, filial, ism va h.k.) qayta so'ramang yoki
    takrorlamang — suhbat tarixidan foydalaning. Javobingiz uzunligini mijozning xabar
    uzunligi va uslubiga moslang: mijoz bir-ikki so'z yoki norasmiy uslubda yozsa, siz ham shunga
    mos qisqa va erkin javob bering; faqat mijoz batafsil so'ragandagina batafsil yozing.
19. YOZUV TIZIMINI MIJOZGA MOSLANG: mijozning ENG OXIRGI xabari qaysi alifboda yozilgan bo'lsa
    (lotin yoki kirill), siz ham javobingizni AYNAN o'sha alifboda yozing. Agar mijoz "Инглиз
    тили курси канча?" kabi kirill alifbosida yozsa, siz ham butunlay kirillda javob bering
    (masalan "Катталар учун ойлик тўлов 420 000 сўм" tarzida — lotin harflariga aslo
    o'tmang). Agar mijoz lotin alifbosida yozsa, siz ham lotin alifbosida javob bering (odatdagi
    holat). Bitta xabar ichida ikkala alifboni aralashtirmang. Mijoz suhbat davomida alifbo
    almashtirsa (masalan avval lotin, keyin kirillga o'tsa), siz ham ENG OXIRGI xabaridagi
    alifboga darhol moslashing.
20. ISH/VAKANSIYA SO'ROVI: agar mijoz o'zi O'QUVCHI sifatida emas, balki markazda
    ISHLASH/XODIM yoki O'QITUVCHI BO'LISH, vakansiya, bo'sh ish o'rni haqida yozgan bo'lsa
    (masalan "ish o'rni bormi", "vakansiya bormi", "sizlarda o'qituvchi kerakmi", "tarix
    fanidan o'qituvchi kerakmi", "menga ish kerak", "ishga qabul qilasizlarmi", "CV yubora
    olamanmi" kabi — buni ANIQ so'zlarga emas, xabarning UMUMIY MA'NOSIGA qarab aniqlang):
    - Bunday xabarni HECH QACHON kursga yozilish/o'quvchi so'rovi deb talqin qilmang — fan
      nomi aytilgan bo'lsa ham (masalan "tarix fani bo'yicha"), buni O'SHA FANDAN O'QITUVCHI
      bo'lish haqida deb tushuning, o'quvchi bo'lish haqida EMAS. Bunday holatda 2-qoidadagi
      "necha yoshli o'quvchi uchun" yoki narx haqidagi savollarni HECH QACHON bermang.
    - 15-qoidadagi "mavzudan tashqari" javobini ham bermang — bu mavzu markazning o'ziga
      tegishli, shuning uchun 15-qoida bu yerga qo'llanmaydi.
    - Buning o'rniga, qisqa va iliq tarzda buni alohida masala ekanini bildirib, yuqoridagi
      ma'lumotlar bazasidagi MARKAZ UMUMIY ALOQA TELEFONI raqamiga to'g'ridan-to'g'ri
      murojaat qilishni so'rang (raqamni albatta ma'lumotlar bazasidan oling, o'ylab
      topmang) — masalan: "Ish/vakansiya masalalari bo'yicha +998 90 123 45 67 raqamiga
      murojaat qilsangiz, sizga yordam berishadi 😊" (1 ta jumladan oshmasin, sabab-tushuntirish
      qo'shmang).
    - DIQQAT — bu 3-qoidadan farq qiladi: bu yerda mijozning telefon raqamini SO'RAMAYSIZ,
      aksincha, markazning O'Z raqamini BERASIZ — ish so'rovchilar bilan administratorlar
      qayta bog'lanmaydi, ular o'zlari qo'ng'iroq qilishi kerak. Shuning uchun bunday holatda
      mijozning telefon raqamini so'ramang va "administratorlarimiz siz bilan bog'lanadi"
      degan gapni ishlatmang.
21. MIJOZ MARKAZ/ADMINISTRATOR TELEFON RAQAMINI SO'RASA (bu 20-qoidadan FARQLI — bu yerda ish/
    vakansiya bilan HECH QANDAY aloqasi yo'q, oddiy o'quvchi/mijoz ham so'rashi mumkin, masalan
    "admin raqamini berolasizmi", "o'zingizning raqamingiz bormi", "sizga qo'ng'iroq qilsam
    bo'ladimi", "markaz raqami nima" kabi — ayniqsa mijoz o'zi allaqachon 3-qoida bo'yicha
    telefon raqamini qoldirgan bo'lsa ham so'rashi mumkin): buni 20-qoida bilan aralashtirmang —
    javobingizda "ish" yoki "vakansiya" so'zini UMUMAN ishlatmang (bu mijozni chalkashtiradi).
    Buning o'rniga, hech qanday qo'shimcha sabab-tushuntirishsiz, to'g'ridan-to'g'ri yuqoridagi
    ma'lumotlar bazasidagi MARKAZ UMUMIY ALOQA TELEFONI raqamini bering — masalan: "Albatta,
    markazimiz raqami: +998 90 123 45 67 😊" (raqamni albatta ma'lumotlar bazasidan oling,
    o'ylab topmang).
`.trim();
}

// Sozlamalar va suhbat tarixi asosida AI javobini generatsiya qiladi. `history` — shu
// suhbatdagi oxirgi xabarlar (eng oxirgisi — mijozning joriy xabari), shunda AI oldingi
// savol-javoblarni "eslab", qisqa/kontekstga bog'liq javoblarni (masalan filial nomi) ham
// to'g'ri tushunadi. Kalit sozlanmagan yoki OpenAI xato qaytarsa null qaytadi — chaqiruvchi
// tomon buni "inson javob yozsin" signali sifatida qabul qiladi.
export async function generateAiReply(
  settings: AcademySettings,
  history: ChatTurn[],
): Promise<string | null> {
  const client = getClient();
  if (!client) {
    console.warn('[ai] OPENAI_API_KEY sozlanmagan, AI javobi otkazib yuborildi');
    return null;
  }
  if (history.length === 0) return null;

  // Mijozning ENG OXIRGI xabari faqat emoji/stikerdan iborat bo'lsa (matn yo'q), AI umuman
  // javob yozmaydi — bunday xabarga "mos" avtomatik javob yo'q, shuning uchun suhbatni ochiq
  // qoldirib, admin xohlasa o'zi javob bersin. Bu FAQAT shu bitta xabarga tegishli — suhbat
  // davomida mijoz keyingi safar matnli xabar yozsa, AI odatdagidek javob berishda davom etadi.
  const latestCustomerMessage = history[history.length - 1];
  if (latestCustomerMessage.role === 'user' && isEmojiOnlyMessage(latestCustomerMessage.content)) {
    console.warn('[ai] Mijoz faqat emoji yubordi, AI javob bermaydi');
    return null;
  }

  try {
    // DIQQAT: bu limitlar past bo'lsa (masalan avvalgi 50), filiallar/fanlar ko'payganda ENG
    // KAM YAQINDA yangilangan yozuvlar AI kontekstidan sirtdan tushib qolib, AI "bunday kurs
    // yo'q" deb noto'g'ri javob beradi (mijoz ko'rgan ma'lumot bazada bor bo'lsa ham) — bu
    // haqiqiy voqeada kuzatilgan (Boburshox filialidagi Turk tili guruhi shu sabab AI ga
    // ko'rinmay qolgan edi). gpt-4o-mini konteksti katta bo'lgani uchun limitni his qilinarli
    // yuqori qo'yish xavfsiz va arzon.
    const [branches, groups, promotions] = await Promise.all([
      prisma.branchInfo.findMany({
        where: { instagramAccountId: settings.instagramAccountId, isActive: true },
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
        take: 500,
      }),
      prisma.groupInfo.findMany({
        where: { instagramAccountId: settings.instagramAccountId, isActive: true },
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
        take: 500,
      }),
      prisma.promotionInfo.findMany({
        where: { instagramAccountId: settings.instagramAccountId, isActive: true },
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
        take: 500,
      }),
    ]);

    const completion = await client.chat.completions.create({
      model: AI_MODEL,
      temperature: 0.6,
      max_tokens: 500,
      messages: [
        {
          role: 'system',
          content: buildSystemPrompt({
            settings,
            branches,
            groups,
            promotions,
            history,
          }),
        },
        ...history,
      ],
    });

    let reply = sanitizeAiReply(completion.choices[0]?.message?.content?.trim() ?? '');
    if (!reply) {
      console.warn('[ai] OpenAI bosh javob qaytardi, xabar yuborilmadi');
      return null;
    }

    if (SELF_REFERENTIAL_HELP_PATTERN.test(reply)) {
      console.warn('[ai] Taqiqlangan robotcha jumla aniqlandi, qayta yozdirilmoqda');
      const rewritten = await rewriteWithoutForbiddenPhrase(
        client,
        reply,
        SELF_REFERENTIAL_HELP_REWRITE_INSTRUCTION,
      );
      if (rewritten && !SELF_REFERENTIAL_HELP_PATTERN.test(rewritten)) {
        reply = rewritten;
      } else {
        // LLM orqali qayta yozish ham muvaffaqiyatsiz bolsa (yoki hali ham taqiqlangan
        // ibora qolgan bolsa), iborani ozimiz regex bilan olib tashlaymiz — shu orqali bu
        // jumla hech qachon mijozga yetib bormasligini kafolatlaymiz.
        const stripped = stripForbiddenSelfReferentialHelp(reply);
        // Hammasi olib tashlangandan keyin bosh qolib ketsa, mijozni javobsiz
        // qoldirishdan kora asl javobni baribir yuboramiz.
        if (stripped) reply = stripped;
      }
    }

    if (ENROLLMENT_SELF_QUESTION_PATTERN.test(reply)) {
      console.warn('[ai] Mijozning "qanday yozilaman" iborasi javobga sizib chiqqan, qayta yozdirilmoqda');
      const rewritten = await rewriteWithoutForbiddenPhrase(
        client,
        reply,
        ENROLLMENT_SELF_QUESTION_REWRITE_INSTRUCTION,
      );
      if (rewritten && !ENROLLMENT_SELF_QUESTION_PATTERN.test(rewritten)) {
        reply = rewritten;
      } else {
        const stripped = stripForbiddenEnrollmentSelfQuestion(reply);
        if (stripped) reply = stripped;
      }
    }

    // Telefon raqami suhbatda ALLAQACHON olingan bo'lsa, "fikringiz o'zgarsa telefon
    // qoldiring" kabi eslatma jumlasi endi ma'nosiz — kod darajasida olib tashlaymiz (14/17
    // qoidalariga ishonib qolmaymiz, chunki bu holatda ham model ba'zan qo'shib yuboradi).
    if (hasPhoneAlreadyBeenCollected(history)) {
      reply = stripPhoneReminderSentences(reply);
    }

    return reply;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[ai] OpenAI chaqiruvida xato: ${message}`);
    return null;
  }
}

export interface ConversationAnalysis {
  leadTemperature: 'HOT' | 'WARM' | 'COLD';
  talkStatus: 'TALKED' | 'NOT_TALKED';
  courseDecision: 'WILL_WRITE' | 'WILL_NOT_WRITE';
  handoverRequested: boolean;
  phoneNumber: string | null;
  interestedCourse: string | null;
  interestedBranch: string | null;
  preferredTime: string | null;
  isJobInquiry: boolean;
}

const analysisSchema = z.object({
  leadTemperature: z.enum(['HOT', 'WARM', 'COLD']),
  talkStatus: z.enum(['TALKED', 'NOT_TALKED']),
  courseDecision: z.enum(['WILL_WRITE', 'WILL_NOT_WRITE']),
  handoverRequested: z.boolean(),
  phoneNumber: z.string().nullable(),
  interestedCourse: z.string().nullable(),
  interestedBranch: z.string().nullable(),
  preferredTime: z.string().nullable(),
  isJobInquiry: z.boolean(),
});

// Tezkor, OpenAI'siz aniqlash: mijozning ENG OXIRGI xabarida operator/inson so'ralganini
// darhol (kechikishsiz) ushlab qolish uchun. Bu — Handover Protocol'ning birinchi qatlami:
// aniq signal bo'lsa, AI javob generatsiya qilishni ham boshlamay, darhol suhbatni insonga
// topshiradi. Nozikroq/bilvosita so'rovlarni esa analyzeConversation() (2-qatlam, AI orqali)
// AI javob yozib bo'lgandan keyin ushlaydi — shuning uchun regex 100% qamrab olishi shart emas.
const HANDOVER_REQUEST_PATTERN =
  /operator|оператор|menejer|менеджер|administrator|(odam|inson)\s*(bilan|gaplash|gaplashtir|javob\s*ber|ulang|ulansin)|jonli\s*(inson|odam|operator)|haqiqiy\s*(odam|inson)|human\s*(agent|support)?|real\s*person|live\s*agent|человек/i;

export function detectHandoverRequest(text: string): boolean {
  return HANDOVER_REQUEST_PATTERN.test(text);
}

// Mijoz avtomatik xabarlardan BUTUNLAY voz kechish (opt-out) so'rovini bildirganda ushlab
// qolish uchun — Meta Messenger/IG Messaging policy talabiga ko'ra (Developer Policies
// 5.2.a), foydalanuvchi doimiy ravishda avtomatik xabarlardan bosh tortish imkoniga ega
// bo'lishi va bu so'rov darhol hurmat qilinishi kerak. Bu handover'dan farqli — handover'da
// mijoz odam bilan gaplashishni xohlaydi (AI vaqtincha to'xtaydi), bu yerda esa mijoz
// umuman xabar olishni xohlamaydi (AI shu suhbatda butunlay, doimiy to'xtaydi).
const OPT_OUT_PATTERN =
  /\b(menga|meni|bizga|endi|boshqa)\b[^.!?\n]{0,15}\byozmang\b|xabar\s*(yubormang|jo['’ʻ]?natmang)|bezovta\s*qilmang|tinch\s*qo['’ʻ]?ying|obuna\w*\s*bekor|yozishni\s*to['’ʻ]?xtat(ing)?|spam\s*qilmang|\bstop\b|\bunsubscribe\b|(менга|мени|бизга|энди|бошқа)[^.!?\n]{0,15}ёзманг|хабар\s*(юборманг|жўнатманг)|безовта\s*қилманг|тинч\s*қўйинг|обуна\w*\s*бекор|ёзишни\s*тўхтат/i;

export function detectOptOutRequest(text: string): boolean {
  return OPT_OUT_PATTERN.test(text);
}

function getLatestUserMessage(history: ChatTurn[]): string {
  for (let i = history.length - 1; i >= 0; i -= 1) {
    if (history[i]?.role === 'user') {
      return history[i].content.trim();
    }
  }
  return '';
}

const EXPLICIT_REJECTION_PATTERN =
  /(kerak\s*emas|kerakmas|qiziq\s*emas|qiziqmas|yoqmadi|mos\s*kelmadi|mos kelmadi|hozircha\s*olmayman|hozircha\s*kerak\s*emas|olmayman|xohlamayman|qimmat|narxi?\s*qimmat|masofa\s*uzoq|uzoq\s*ekan|vaqt\s*mos\s*kelmadi|vaqt\s*to'g'ri\s*emas|time\s*mos\s*emas|keyinroq\s*yozaman|keyinroq\s*qolaman)/i;

const STRONG_INTEREST_PATTERN =
  /(ro'?yxatdan\s*o't|yozil|yozilsam|qanday\s*yozil|kursga\s*yozil|qabul\s*qila\s*asiz|qoldir|telefon\s*qoldir|raqam\s*qoldir|bog'lan|ulang|ulanglar|operator\s*kerak|manzil\s*yubor|jadval\s*yubor|narx\s*qancha|qancha\s*tur|kurs\s*bor|bormi|ma'lumot\s*ber|batafsil\s*ber)/i;

const INFO_SEEKING_PATTERN =
  /(narx|qancha|qayerda|manzil|adres|telefon|raqam|jadval|vaqt|qachon|filial|kurs\s*bor|bormi|qaysi\s*kurs|dars\s*kun|dars\s*vaqt|yo'nalish|yo'nalishi|necha\s*so'm|qancha\s*so'm|qaysi\s*filial)/i;

function refineConversationAnalysis(history: ChatTurn[], analysis: ConversationAnalysis): ConversationAnalysis {
  const latestUserMessage = getLatestUserMessage(history);
  if (!latestUserMessage) return analysis;

  const explicitRejection = EXPLICIT_REJECTION_PATTERN.test(latestUserMessage);
  const strongInterest = STRONG_INTEREST_PATTERN.test(latestUserMessage);
  const infoSeeking = INFO_SEEKING_PATTERN.test(latestUserMessage);

  if (explicitRejection) {
    return {
      ...analysis,
      leadTemperature: 'COLD',
      courseDecision: 'WILL_NOT_WRITE',
      handoverRequested: analysis.handoverRequested,
      interestedCourse: analysis.interestedCourse,
    };
  }

  if (strongInterest) {
    return {
      ...analysis,
      leadTemperature: 'HOT',
      courseDecision: 'WILL_WRITE',
    };
  }

  if (infoSeeking && analysis.courseDecision === 'WILL_NOT_WRITE') {
    return {
      ...analysis,
      leadTemperature: analysis.leadTemperature === 'COLD' ? 'WARM' : analysis.leadTemperature,
      courseDecision: 'WILL_WRITE',
    };
  }

  if (infoSeeking && analysis.leadTemperature === 'COLD') {
    return {
      ...analysis,
      leadTemperature: 'WARM',
    };
  }

  return analysis;
}

// Handover ishga tushganda mijozga darhol yuboriladigan qisqa, tabiiy xabar — AI emas,
// admin/operatorga ulanayotganini bildiradi. Har safar bir xil bo'lmasligi uchun bir nechta
// variant orasidan tasodifiy tanlanadi.
const HANDOVER_ACKNOWLEDGEMENTS = [
  "Albatta, hozir sizni operatorimizga ulayapman, biroz kuting 🙌",
  "Tushunarli, hozir administratorlarimizdan biri siz bilan bog'lanadi, birozdan so'ng javob beradi 😊",
  "Yaxshi, sizni jonli operatorga ulaymiz — tez orada javob berishadi 🙌",
];

export function pickHandoverAcknowledgement(): string {
  return HANDOVER_ACKNOWLEDGEMENTS[Math.floor(Math.random() * HANDOVER_ACKNOWLEDGEMENTS.length)];
}

// Mijoz opt-out so'raganda darhol yuboriladigan qisqa tasdiq xabari — shundan keyin bu
// suhbatda AI umuman avtomatik xabar yozmaydi (admin xohlasa qo'lda yozishi mumkin).
const OPT_OUT_ACKNOWLEDGEMENTS = [
  "Tushunarli, endi sizga avtomatik xabar yubormaymiz 🙏",
  "Albatta, avtomatik xabarlarni shu yerda to'xtatamiz 🙏",
  "Yaxshi, bundan keyin sizga xabar yubormaymiz. Yaxshi kunlar tilaymiz 🙏",
];

export function pickOptOutAcknowledgement(): string {
  return OPT_OUT_ACKNOWLEDGEMENTS[Math.floor(Math.random() * OPT_OUT_ACKNOWLEDGEMENTS.length)];
}

const ANALYSIS_SYSTEM_PROMPT = `
Siz "InboxCRM" tizimi uchun ishlaydigan suhbat tahlilchisisiz. Sizga Instagram DM orqali
o'quv markazi va mijoz o'rtasidagi suhbat tarixi beriladi ("Mijoz:" — kontakt, "Admin:" — markaz
tomonidan yozilgan javob, inson yoki AI farqi yo'q). Vazifangiz — shu suhbatni to'qqizta mezon
bo'yicha tasniflab, FAQAT quyidagi JSON formatida javob berish (boshqa hech qanday matn, izoh
yoki markdown qo'shmang):

{"leadTemperature": "HOT" | "WARM" | "COLD", "talkStatus": "TALKED" | "NOT_TALKED", "courseDecision": "WILL_WRITE" | "WILL_NOT_WRITE", "handoverRequested": true | false, "phoneNumber": string | null, "interestedCourse": string | null, "interestedBranch": string | null, "preferredTime": string | null, "isJobInquiry": true | false}

Mezonlar:

1. leadTemperature (mijozning qizg'inligi):
   - HOT: mijoz aniq qiziqish bildirgan va yozilishga/qaror qabul qilishga yaqin — masalan
     telefon raqam qoldirgan yoki qoldirishga rozi bo'lgan, "qanday yozilsam bo'ladi",
     "ro'yxatdan o'tmoqchiman", "narxi mos keladi, olaman" kabi aniq signal bergan.
   - COLD: mijoz aniq rad etgan yoki suhbatni yopgan — "kerak emas", "qiziq emas", "yoqmadi",
     "mos kelmadi", "hozircha olmayman" kabi ochiq radlar.
   - WARM: yuqoridagi ikkisiga aniq mos kelmaydigan barcha hollar — savol so'ramoqda, ma'lumot
     olmoqda, narx/manzil/telefon/jadval/filial haqida so'rayapti, lekin hali qat'iy rad ham,
     yozilish qarori ham yo'q.
   Muhim: narx, manzil, telefon raqam, jadval, filial, dars vaqti yoki kurs bor-yo'qligini
   so'rash COLD emas. Bunday xabarlar odatda WARM hisoblanadi.

2. talkStatus (real muloqot bo'lganmi):
   - TALKED: mijoz va markaz o'rtasida haqiqiy ikki tomonlama dialog bo'lgan (mijoz kamida bir
     necha marta mazmunli javob yozgan, faqat bitta salomlashuv emas).
   - NOT_TALKED: mijoz hali yetarlicha javob bermagan yoki suhbat shunchaki boshlangan
     (masalan faqat bitta xabar yoki salomlashuv bilan tugagan).

3. courseDecision (kursga yozilish ehtimoli):
   - WILL_NOT_WRITE: mijoz ANIQ rad etgan yoki qiziqmasligini bildirgan ("kerak emas",
     "qiziq emas", "yoqmadi", "mos kelmadi" va shunga o'xshash ochiq radlar).
   - WILL_WRITE: barcha boshqa hollar — savol so'rash, narx/manzil/telefon/jadval haqida
     aniqlik kiritish, hali qaror bermagan holatlar yoki qiziqish davom etayotgan vaziyatlar.

4. handoverRequested (mijoz operatorga ulanishga ANIQ rozilik bildirdimi):
   true FAQAT quyidagi ikki holatdan BIRIGA to'liq mos kelsa qaytariladi:
   a) Mijoz o'z xabarida so'zma-so'z va ANIQ inson/operator bilan gaplashishni TALAB qilgan
      bo'lsa — masalan "odam bilan gaplashtiring", "operator kerak", "menejer bilan ulang",
      "jonli operator bilan gaplashsam bo'ladimi", "haqiqiy odam javob bersin", "albatta odam
      gaplashsin". Bu holatda darhol true (mijoz ochiq-oydin talab qilgan).
   b) Suhbat tarixidagi ENG OXIRGI Admin/AI xabarida operatorga ulanish aniq SAVOL/TAKLIF
      sifatida berilgan bo'lsa (masalan "operatorimizga ulasammi?", "sizni operatorga ulashim
      mumkin, xohlaysizmi?") VA mijozning shundan keyingi javobi shu taklifga aniq roziliq
      bo'lsa (masalan "ha", "mayli", "xop", "ulang", "bo'ladi", "albatta").
   FALSE — QOLGAN BARCHA hollarda, HECH QANDAY ISTISNOSIZ:
   - Mijoz kursni yoki narxni rad etsa, "menga mos kelmadi", "kerak emas", "o'ylab ko'raman"
     kabi yozsa — bu ODDIY RAD JAVOBI, handoverRequested EMAS. false qaytaring.
   - Mijoz AI javobidan norozi bo'lsa, savolini tushunmagan bo'lsangiz, yoki javob
     berolmasangiz ham — agar mijoz (a) yoki (b) shartiga mos ANIQ so'z bilan javob bermagan
     bo'lsa, false qaytaring. AI o'zi operatorga ulash TAKLIFINI bergani (rule 15) hali
     handoverRequested=true degani EMAS — faqat mijoz shu taklifga rozi bo'lgandagina (b) band
     ishga tushadi.
   - Faqat "administrator", "menejer" so'zi biror kontekstda (masalan AI javobida) o'tgani
     handoverRequested=true qilmaydi — bu FAQAT mijozning O'Z xabariga tegishli mezon.

5. phoneNumber (mijozning aloqa telefon raqami):
   - Agar mijoz suhbat davomida O'ZINING telefon raqamini yozgan bo'lsa (masalan ro'yxatdan
     o'tish/kursga yozilish uchun qoldirgan bo'lsa), shu raqamni xalqaro formatga yaqinlashtirib
     ("+998901234567" kabi, bo'sh joy/tire olib tashlab) qaytaring.
   - Agar suhbatda bir nechta raqam bo'lsa, ENG OXIRGI marta mijoz o'zi yozgan raqamni oling.
   - Agar mijoz raqam yozmagan bo'lsa, yoki gap boshqa birovning raqami haqida bo'lsa (masalan
     "do'stimning raqami"), null qaytaring — taxmin qilib to'qimang.

6. interestedCourse (mijoz qiziqish bildirgan fan/kurs nomi):
   - Agar mijoz suhbat davomida aniq bitta (yoki bir nechta) fan/kurs nomini aytgan yoki shu
     haqida so'ragan bo'lsa, o'sha nomni qisqa, o'z holicha (mijoz qanday atagan bo'lsa,
     tuzatib, katta harf bilan) qaytaring — masalan "Matematika", "Ingliz tili", "Frontend dasturlash".
   - Bir nechta fan/kurs aytilgan bo'lsa, vergul bilan ajratib barchasini yozing.
   - Agar mijoz aniq fan/kurs nomini aytmagan (masalan faqat "narxlaringiz qancha" deb umumiy
     so'ragan) bo'lsa, null qaytaring — taxmin qilib to'qimang.

7. interestedBranch (mijoz yozilmoqchi bo'lgan yoki qulay deb aytgan filial nomi):
   - Agar mijoz suhbat davomida aniq bitta filial nomini aytgan yoki tanlagan bo'lsa (masalan
     "Boburshox", "Chorsu", "Davlatobod" yoki ma'lumotlar bazasida ko'rsatilgan boshqa filial
     nomi), o'sha nomni qaytaring.
   - Agar mijoz filial nomini aytmagan yoki hali aniq tanlamagan bo'lsa, null qaytaring —
     taxmin qilib to'qimang.

8. preferredTime (mijoz qulay deb aytgan dars vaqti/oralig'i):
   - Agar mijoz suhbat davomida aniq vaqt yoki vaqt oralig'ini aytgan bo'lsa (masalan "8:00 dan
     10:00 gacha", "ertalabki guruh", "kechqurun soat 6da"), o'sha ifodani mijoz qanday aytgan
     bo'lsa, o'z holicha qisqa qaytaring.
   - Agar mijoz aniq vaqt aytmagan bo'lsa, null qaytaring — taxmin qilib to'qimang.

9. isJobInquiry (mijoz O'QUVCHI sifatida emas, XODIM/ISHGA KIRISH maqsadida yozganmi):
   - true: mijoz markazda ISHLASH, o'qituvchi/xodim bo'lish, vakansiya, bo'sh ish o'rni haqida
     so'ragan yoki o'zini ishga taklif qilgan bo'lsa — buni ANIQ so'zlarga emas, xabarning UMUMIY
     MA'NOSIGA qarab aniqlang. Masalan: "ish o'rni bormi", "vakansiya bormi", "sizlarda o'qituvchi
     kerakmi", "men turk tili o'rgataman, ishga olasizlarmi", "CV yubora olamanmi", "maosh qancha
     bo'ladi (ishga oid kontekstda)", "necha soat ishlash kerak bo'ladi", "hodim sifatida qabul
     qilasizlarmi" — bularning barchasi turlicha so'z bilan aytilgan bo'lsa ham MA'NOSI bir xil:
     mijoz ISHGA KIRMOQCHI, kursga YOZILMOQCHI EMAS.
   - false: mijoz o'zi yoki farzandi/qarindoshi uchun kursga yozilish, narx, jadval, filial haqida
     so'ragan barcha oddiy holatlarda — bu ustun ODATDA false bo'ladi.
   - Diqqat: "kurs bormi", "narxi qancha" kabi O'QUVCHI sifatidagi so'rovlar bilan adashtirmang —
     faqat mijoz aniq ISHLASH/XODIM/VAKANSIYA ma'nosida yozgandagina true qaytaring.

Faqat suhbat tarixidagi haqiqiy dalillarga tayaning, taxmin qilib to'qib chiqarmang. Suhbat juda
qisqa yoki noaniq bo'lsa, xavfsiz standart qiymatlardan foydalaning: leadTemperature="WARM",
talkStatus mos holatga qarab, courseDecision="WILL_WRITE", handoverRequested=false, phoneNumber=null,
interestedCourse=null, interestedBranch=null, preferredTime=null, isJobInquiry=false.
`.trim();

function formatHistoryForAnalysis(history: ChatTurn[]): string {
  return history
    .map((turn) => `${turn.role === 'user' ? 'Mijoz' : 'Admin'}: ${turn.content}`)
    .join('\n');
}

// Suhbat tarixi asosida lead'ni uchta ustun (temperatura, gaplashish holati, kursga yozilish
// ehtimoli) bo'yicha avtomatik tasniflaydi. AI mijozga javob yozgandan keyin chaqiriladi —
// natija leads bo'limidagi ustunlarni yangilash uchun ishlatiladi. Kalit sozlanmagan, tarix
// bo'sh yoki javob JSON formatiga mos kelmasa, null qaytadi (chaqiruvchi tomon eski qiymatlarni
// saqlab qoladi).
export async function analyzeConversation(history: ChatTurn[]): Promise<ConversationAnalysis | null> {
  const client = getClient();
  if (!client) return null;
  if (history.length === 0) return null;

  try {
    const completion = await client.chat.completions.create({
      model: AI_MODEL,
      temperature: 0,
      max_tokens: 200,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: ANALYSIS_SYSTEM_PROMPT },
        { role: 'user', content: formatHistoryForAnalysis(history) },
      ],
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) return null;

    const parsed = analysisSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      console.warn('[ai] Tahlil natijasi kutilgan formatga mos kelmadi');
      return null;
    }

    return refineConversationAnalysis(history, parsed.data);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[ai] Suhbatni tahlil qilishda xato: ${message}`);
    return null;
  }
}

import axios from 'axios';
import { env, getTelegramChannelIds } from '../config/env';

export interface NewLeadNotification {
  academyName: string;
  phoneNumber: string;
  // Kontaktda shu xabardan OLDIN saqlangan raqam (bo'lmasa null). Faqat xabar matnida qanday
  // izoh chiqishini belgilash uchun — dedup uchun EMAS: mijoz bir xil raqamni qayta yozsa ham
  // (masalan yangi kursga yozilmoqchi bo'lsa), baribir har safar guruhga xabar yuboriladi.
  previousPhoneNumber: string | null;
  courseName: string | null;
  branch: string | null;
  preferredTime: string | null;
  contactName: string | null;
  contactUsername: string | null;
  // true bo'lsa, mijoz kursga emas, ISH O'RNIGA (vakansiya) qiziqib yozgan — xabar shunga
  // qarab alohida (kurs lidi bilan aralashmaydigan) ko'rinishda chiqariladi.
  isJobInquiry?: boolean;
}

export interface NewAdLeadNotification {
  campaignTitle: string;
  pageName: string | null;
  formName: string | null;
  fullName: string;
  phoneNumber: string;
  email: string | null;
  comment: string | null;
  leadId: string;
}

export function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Istalgan chatga (guruh, kanal yoki shaxsiy) erkin matn yuborish uchun umumiy funksiya —
// masalan /id komandasiga javob berishda ishlatiladi (telegramWebhook.ts). BOT_TOKEN
// sozlanmagan bolsa jim otkazib yuboradi, xato tashlamaydi.
export async function sendTelegramMessage(chatId: number | string, text: string): Promise<void> {
  if (!env.TELEGRAM_BOT_TOKEN) {
    console.warn('[telegram] TELEGRAM_BOT_TOKEN sozlanmagan, xabar yuborilmadi');
    return;
  }

  try {
    const response = await axios.post(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
    });

    if (!response.data?.ok) {
      console.error(`[telegram] Telegram "ok:false" qaytardi (chat_id=${chatId}): ${JSON.stringify(response.data)}`);
    }
  } catch (err) {
    const details = axios.isAxiosError(err) && err.response ? JSON.stringify(err.response.data) : undefined;
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[telegram] Xabar yuborishda xato (chat_id=${chatId}): ${message}${details ? ` — ${details}` : ''}`);
  }
}

function buildMessage(lead: NewLeadNotification): string {
  if (lead.isJobInquiry) {
    const lines = [
      `<b>💼 ${escapeHtml(lead.academyName)} — vakansiya so'ralmoqda</b>`,
      '',
      "⚠️ <i>Diqqat: bu — kurs lidi EMAS, mijoz ISH O'RNI (vakansiya) haqida so'ragan!</i>",
      `📞 <b>Telefon:</b> ${escapeHtml(lead.phoneNumber)}`,
    ];
    const jobContactLabel = lead.contactName || lead.contactUsername;
    if (jobContactLabel) {
      lines.push(`👤 <b>Instagram:</b> ${escapeHtml(jobContactLabel)}`);
    }
    return lines.join('\n');
  }

  const title = lead.branch ? escapeHtml(lead.branch) : `${escapeHtml(lead.academyName)} — yangi lid`;

  const lines = [`<b>📍 ${title}</b>`, ''];
  if (lead.previousPhoneNumber && lead.previousPhoneNumber === lead.phoneNumber) {
    lines.push("🔁 <i>Mijoz shu raqamni yana yubordi — yangi kursga qiziqqan bo'lishi mumkin</i>");
  } else if (lead.previousPhoneNumber) {
    lines.push('🔄 <i>Mijoz raqamini yangiladi</i>');
  }
  lines.push(`📞 <b>Telefon:</b> ${escapeHtml(lead.phoneNumber)}`);
  lines.push(`📚 <b>Kurs:</b> ${lead.courseName ? escapeHtml(lead.courseName) : 'aniqlanmagan'}`);
  if (lead.preferredTime) {
    lines.push(`🕒 <b>Qulay vaqt:</b> ${escapeHtml(lead.preferredTime)}`);
  }
  const contactLabel = lead.contactName || lead.contactUsername;
  if (contactLabel) {
    lines.push(`👤 <b>Instagram:</b> ${escapeHtml(contactLabel)}`);
  }

  return lines.join('\n');
}

// Telefon raqam birinchi marta aniqlangan lidni sozlangan BARCHA Telegram kanal/guruhlarga
// (TELEGRAM_CHANNEL_ID + TELEGRAM_CHANNEL_IDS) yuboradi. BOT_TOKEN yoki birorta ham kanal ID
// sozlanmagan bo'lsa, jim o'chiq holatda ishlaydi (xato tashlamaydi) — chaqiruvchi tomon
// (webhookProcessor) buni fire-and-forget sifatida chaqiradi.
export async function notifyNewLead(lead: NewLeadNotification): Promise<void> {
  const channelIds = getTelegramChannelIds();
  if (!env.TELEGRAM_BOT_TOKEN || channelIds.length === 0) {
    console.warn('[telegram] TELEGRAM_BOT_TOKEN yoki TELEGRAM_CHANNEL_ID(S) sozlanmagan, lid xabarnomasi otkazib yuborildi');
    return;
  }

  console.log(`[telegram] Lid xabarnomasi yuborilmoqda (${channelIds.length} ta kanalga, telefon=${lead.phoneNumber})`);

  const text = buildMessage(lead);
  await Promise.all(channelIds.map((chatId) => sendTelegramMessage(chatId, text)));
}

function buildAdLeadMessage(lead: NewAdLeadNotification): string {
  const lines = [`<b>📣 ${escapeHtml(lead.campaignTitle)}</b>`, ''];
  if (lead.pageName || lead.formName) {
    const parts = [lead.pageName ? escapeHtml(lead.pageName) : null, lead.formName ? escapeHtml(lead.formName) : null].filter(Boolean);
    lines.push(`🧩 <b>Manba:</b> ${parts.join(' / ') || 'Meta Lead Form'}`);
  }
  lines.push(`🆔 <b>Lead ID:</b> ${escapeHtml(lead.leadId)}`);
  lines.push(`👤 <b>Ism:</b> ${escapeHtml(lead.fullName)}`);
  lines.push(`📞 <b>Telefon:</b> ${escapeHtml(lead.phoneNumber)}`);
  if (lead.email) {
    lines.push(`✉️ <b>Email:</b> ${escapeHtml(lead.email)}`);
  }
  if (lead.comment) {
    lines.push(`📝 <b>Izoh:</b> ${escapeHtml(lead.comment)}`);
  }
  return lines.join('\n');
}

export async function notifyNewAdLead(lead: NewAdLeadNotification): Promise<void> {
  const channelIds = getTelegramChannelIds();
  if (!env.TELEGRAM_BOT_TOKEN || channelIds.length === 0) {
    console.warn('[telegram] TELEGRAM_BOT_TOKEN yoki TELEGRAM_CHANNEL_ID(S) sozlanmagan, reklama lid xabarnomasi otkazib yuborildi');
    return;
  }

  console.log(`[telegram] Reklama lid xabarnomasi yuborilmoqda (${channelIds.length} ta kanalga, telefon=${lead.phoneNumber})`);

  const text = buildAdLeadMessage(lead);
  await Promise.all(channelIds.map((chatId) => sendTelegramMessage(chatId, text)));
}

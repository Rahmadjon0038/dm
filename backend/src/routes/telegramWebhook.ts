import { Request, Router } from 'express';
import { escapeHtml, sendTelegramMessage } from '../bot/telegramNotifier';
import { env } from '../config/env';

const router = Router();

// Guruh/kanal/shaxsiy chatda "/id" yozilsa shu chatning ID sini qaytaradi — kanal_id yoki
// guruh_id ni topish uchun (masalan TELEGRAM_CHANNEL_ID ni sozlashda). Guruhda bot nomi bilan
// yozilishi ham mumkin ("/id@BotUsername").
const ID_COMMAND_PATTERN = /^\/id(@\w+)?\s*$/i;

const CHAT_TYPE_LABELS: Record<string, string> = {
  private: 'Shaxsiy chat',
  group: 'Guruh',
  supergroup: 'Super-guruh',
  channel: 'Kanal',
};

interface TelegramChat {
  id: number | string;
  type?: string;
  title?: string;
}

interface TelegramMessage {
  text?: string;
  chat?: TelegramChat;
  // Kanaldan botning shaxsiy chatiga forward qilingan xabarda asl kanal shu yerda keladi —
  // Bot API versiyasiga qarab ikki xil shaklda: eski "forward_from_chat" yoki yangi
  // "forward_origin.chat" (type="channel" bolganda). Kanal ID sini HECH KIMGA ko'rinmasdan
  // (kanalga post qilmasdan) bilib olishning eng qulay yoli — shu.
  forward_from_chat?: TelegramChat;
  forward_origin?: { type?: string; chat?: TelegramChat };
}

interface TelegramUpdate {
  message?: TelegramMessage;
  // Kanalga to'g'ridan-to'g'ri qilingan post (kanal admin sifatida yozilgan "/id") oddiy
  // "message" emas, alohida shu turda keladi — Telegram API shunday ajratadi.
  channel_post?: TelegramMessage;
}

function buildIdReply(chat: TelegramChat, forwarded: boolean): string {
  const typeLabel = (chat.type && CHAT_TYPE_LABELS[chat.type]) || chat.type || "Noma'lum";
  const idLabel = forwarded ? 'Forward qilingan manba ID si' : 'Chat ID';
  const lines = [
    `🆔 <b>${idLabel}:</b> <code>${chat.id}</code>`,
    `<b>Turi:</b> ${escapeHtml(typeLabel)}`,
  ];
  if (chat.title) {
    lines.push(`<b>Nomi:</b> ${escapeHtml(chat.title)}`);
  }
  return lines.join('\n');
}

// Telegramning setWebhook(secret_token=...) orqali beriladigan headerini tekshiradi.
function isSecretValid(req: Request): boolean {
  if (!env.TELEGRAM_WEBHOOK_SECRET) return true;
  return req.headers['x-telegram-bot-api-secret-token'] === env.TELEGRAM_WEBHOOK_SECRET;
}

// Telegram bot API dan kelgan barcha updatelar shu yerga tushadi (setWebhook orqali
// ro'yxatdan otkazilgach). Ikki holatni ushlaydi:
//  1) "/id" komandasi (guruh/kanal/shaxsiy chatda) — o'sha CHAT ning o'z ID sini qaytaradi.
//  2) Botning shaxsiy chatiga kanal/guruhdan FORWARD qilingan istalgan xabar — hech kimga
//     ko'rinmasdan, o'sha asl kanal/guruhning ID sini shaxsiy javob qilib beradi (kanalga
//     ochiq post qilishni istamasa shu qulayroq).
router.post('/telegram', (req, res) => {
  if (!isSecretValid(req)) {
    console.warn('[telegram-webhook] Secret token notogri, so\'rov rad etildi');
    return res.sendStatus(401);
  }

  // Telegram tez javob kutadi: avval 200 qaytariladi, ishlov keyin bajariladi.
  res.sendStatus(200);

  const update = req.body as TelegramUpdate;
  const message = update?.message ?? update?.channel_post;
  if (!message?.chat) return;

  const forwardedChat = message.forward_from_chat ?? message.forward_origin?.chat;
  if (forwardedChat) {
    sendTelegramMessage(message.chat.id, buildIdReply(forwardedChat, true));
    return;
  }

  const text = message.text?.trim();
  if (text && ID_COMMAND_PATTERN.test(text)) {
    sendTelegramMessage(message.chat.id, buildIdReply(message.chat, false));
  }
});

export default router;

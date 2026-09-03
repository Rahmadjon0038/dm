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
}

interface TelegramUpdate {
  message?: TelegramMessage;
}

function buildIdReply(chat: TelegramChat): string {
  const typeLabel = (chat.type && CHAT_TYPE_LABELS[chat.type]) || chat.type || "Noma'lum";
  const lines = [
    `🆔 <b>Chat ID:</b> <code>${chat.id}</code>`,
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
// ro'yxatdan otkazilgach). Hozircha faqat "/id" komandasini ushlab, chat ID sini javob
// qilib qaytaradi.
router.post('/telegram', (req, res) => {
  if (!isSecretValid(req)) {
    console.warn('[telegram-webhook] Secret token notogri, so\'rov rad etildi');
    return res.sendStatus(401);
  }

  // Telegram tez javob kutadi: avval 200 qaytariladi, ishlov keyin bajariladi.
  res.sendStatus(200);

  const update = req.body as TelegramUpdate;
  const message = update?.message;
  const text = message?.text?.trim();
  const chat = message?.chat;

  if (text && chat && ID_COMMAND_PATTERN.test(text)) {
    sendTelegramMessage(chat.id, buildIdReply(chat));
  }
});

export default router;

import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(4000),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL majburiy'),

  JWT_SECRET: z.string().min(16, 'JWT_SECRET kamida 16 belgi bolishi kerak'),
  JWT_EXPIRES_IN: z.string().default('7d'),

  // AES-256 uchun 32 baytlik kalit, hex korinishida (64 ta hex belgi).
  TOKEN_ENCRYPTION_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, 'TOKEN_ENCRYPTION_KEY 64 ta hex belgi (32 bayt) bolishi kerak. Yaratish: openssl rand -hex 32'),

  FRONTEND_URL: z.string().url().default('http://localhost:3000'),
  FRONTEND_URLS: z.string().optional(),
  BACKEND_URL: z.string().optional(),

  INSTAGRAM_APP_ID: z.string().optional(),
  INSTAGRAM_APP_SECRET: z.string().optional(),
  INSTAGRAM_ACCESS_TOKEN: z.string().optional(),
  INSTAGRAM_ACCOUNT_ID: z.string().optional(),
  INSTAGRAM_VERIFY_TOKEN: z.string().optional(),
  META_VERIFY_TOKEN: z.string().optional(),

  // Berilmasa, AI auto-reply o'chiq holatda ishlaydi (fallback: inson javob yozadi).
  OPENAI_API_KEY: z.string().optional(),

  // Telefon raqam qoldirgan lidlarni Telegram kanaliga yuborish uchun. Ikkalasi ham
  // berilmasa, lid xabarnomasi jim o'chiq holatda ishlaydi.
  TELEGRAM_BOT_TOKEN: z.string().optional(),
  TELEGRAM_CHANNEL_ID: z.string().optional(),
  // Bitta kanaldan tashqari yana qoshimcha kanal/guruhlarga ham lid yubormoqchi bo'lsangiz,
  // ularning chat ID sini vergul bilan ajratib shu yerga yozing (masalan "-1001111,-1002222").
  // FRONTEND_URL/FRONTEND_URLS bilan bir xil pattern.
  TELEGRAM_CHANNEL_IDS: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Environment variables notogri:');
  for (const issue of parsed.error.issues) {
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = parsed.data;
export const isProduction = env.NODE_ENV === 'production';

export function getAllowedOrigins(): string[] {
  const origins = new Set<string>();

  origins.add(env.FRONTEND_URL);

  if (env.FRONTEND_URLS) {
    for (const origin of env.FRONTEND_URLS.split(',').map((value) => value.trim())) {
      if (origin) origins.add(origin);
    }
  }

  return [...origins];
}

export function getTelegramChannelIds(): string[] {
  const ids = new Set<string>();

  if (env.TELEGRAM_CHANNEL_ID) ids.add(env.TELEGRAM_CHANNEL_ID.trim());

  if (env.TELEGRAM_CHANNEL_IDS) {
    for (const id of env.TELEGRAM_CHANNEL_IDS.split(',').map((value) => value.trim())) {
      if (id) ids.add(id);
    }
  }

  return [...ids];
}

import crypto from 'crypto';
import { Request, Router } from 'express';
import { env } from '../config/env';
import { getAccount } from '../services/accountService';
import { processWebhookPayload } from '../services/webhookProcessor';

const router = Router();

interface RawBodyRequest extends Request {
  rawBody?: Buffer;
}

// Meta webhook verification (Callback URL tasdiqlash).
router.get('/instagram', async (req, res) => {
  const mode = req.query['hub.mode'];
  const verifyToken = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const account = await getAccount().catch(() => null);
  const expectedTokens = [account?.verifyToken, env.INSTAGRAM_VERIFY_TOKEN].filter(Boolean);

  if (
    mode === 'subscribe' &&
    typeof verifyToken === 'string' &&
    typeof challenge === 'string' &&
    expectedTokens.includes(verifyToken)
  ) {
    console.log('[webhook] Verification muvaffaqiyatli');
    return res.status(200).send(challenge);
  }

  console.warn('[webhook] Verification rad etildi (verify token mos kelmadi)');
  return res.sendStatus(403);
});

// X-Hub-Signature-256 imzosini app secret bilan tekshirish.
function isSignatureValid(req: RawBodyRequest): boolean {
  if (!env.INSTAGRAM_APP_SECRET) {
    // App secret berilmagan bolsa imzo tekshirilmaydi (faqat test rejimi uchun).
    return true;
  }
  const signature = req.headers['x-hub-signature-256'];
  if (typeof signature !== 'string' || !req.rawBody) return false;

  const expected =
    'sha256=' +
    crypto.createHmac('sha256', env.INSTAGRAM_APP_SECRET).update(req.rawBody).digest('hex');

  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

// Instagram webhook eventlari shu yerga keladi.
router.post('/instagram', (req: RawBodyRequest, res) => {
  if (!isSignatureValid(req)) {
    console.warn('[webhook] Imzo notogri, event rad etildi');
    return res.sendStatus(401);
  }

  // Meta tez javob kutadi: avval 200 qaytariladi, ishlov keyin bajariladi.
  res.sendStatus(200);

  const payload = req.body;
  setImmediate(() => {
    processWebhookPayload(payload).catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[webhook] Qayta ishlashda xato: ${message}`);
    });
  });
});

export default router;

import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { encryptToken } from '../lib/crypto';
import { AppError } from '../lib/errors';
import { requireAuth } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { fetchMe, subscribeToMessages } from '../services/instagramApi';
import { getAccount, getAccessToken, toPublicAccount } from '../services/accountService';

const router = Router();

router.use(requireAuth);

const connectSchema = z.object({
  instagramAccountId: z.string().trim().optional(),
  username: z.string().trim().optional(),
  accessToken: z.string().trim().min(10, 'Access token juda qisqa'),
  verifyToken: z.string().trim().min(8, 'Verify token kamida 8 belgi bolishi kerak'),
});

// Tokenni Instagram API orqali tekshiradi va akkauntni ulaydi.
router.post('/connect', validateBody(connectSchema), async (req, res, next) => {
  try {
    const body = req.body as z.infer<typeof connectSchema>;

    // Token haqiqiyligini Instagram API orqali tekshiramiz — API javobi asosiy manba.
    const profile = await fetchMe(body.accessToken);

    if (body.instagramAccountId && body.instagramAccountId !== profile.id) {
      throw new AppError(
        `Kiritilgan Account ID (${body.instagramAccountId}) token egasiga mos kelmadi. API qaytargan ID: ${profile.id}`,
        400,
      );
    }

    // Long-lived Instagram token odatda 60 kun amal qiladi.
    const tokenExpiresAt = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);

    const data = {
      instagramAccountId: profile.id,
      username: profile.username,
      name: profile.name ?? null,
      profilePictureUrl: profile.profilePictureUrl ?? null,
      accountType: profile.accountType ?? null,
      encryptedAccessToken: encryptToken(body.accessToken),
      verifyToken: body.verifyToken,
      isConnected: true,
      tokenExpiresAt,
    };

    // MVP: bitta akkaunt — mavjud bolsa yangilanadi, bolmasa yaratiladi.
    const existing = await getAccount();
    const account = existing
      ? await prisma.instagramAccount.update({ where: { id: existing.id }, data })
      : await prisma.instagramAccount.create({ data });

    // Akkauntni webhook eventlariga obuna qilamiz (aks holda DM eventlari kelmaydi).
    const webhookSubscribed = await subscribeToMessages(body.accessToken);

    return res.json({ account: toPublicAccount(account), webhookSubscribed });
  } catch (err) {
    return next(err);
  }
});

router.get('/account', async (_req, res, next) => {
  try {
    const account = await getAccount();
    return res.json({ account: account ? toPublicAccount(account) : null });
  } catch (err) {
    return next(err);
  }
});

// Saqlangan token bilan ulanishni qayta tekshiradi va profil malumotlarini yangilaydi.
router.post('/test-connection', async (_req, res, next) => {
  try {
    const account = await getAccount();
    if (!account || !account.encryptedAccessToken) {
      throw new AppError('Instagram akkaunt hali ulanmagan', 400);
    }

    const token = getAccessToken(account);
    const profile = await fetchMe(token);
    const updated = await prisma.instagramAccount.update({
      where: { id: account.id },
      data: {
        username: profile.username,
        name: profile.name ?? null,
        profilePictureUrl: profile.profilePictureUrl ?? null,
        accountType: profile.accountType ?? null,
        isConnected: true,
      },
    });

    // Har tekshiruvda webhook obunasini ham qayta mustahkamlaymiz.
    const webhookSubscribed = await subscribeToMessages(token);

    return res.json({ ok: true, account: toPublicAccount(updated), webhookSubscribed });
  } catch (err) {
    return next(err);
  }
});

router.post('/disconnect', async (_req, res, next) => {
  try {
    const account = await getAccount();
    if (!account) {
      throw new AppError('Ulangan akkaunt topilmadi', 404);
    }

    const updated = await prisma.instagramAccount.update({
      where: { id: account.id },
      data: {
        isConnected: false,
        encryptedAccessToken: null,
        tokenExpiresAt: null,
      },
    });

    return res.json({ ok: true, account: toPublicAccount(updated) });
  } catch (err) {
    return next(err);
  }
});

export default router;

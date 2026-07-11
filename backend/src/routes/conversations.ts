import { SenderType } from '@prisma/client';
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { AppError } from '../lib/errors';
import { requireAuth } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { sendTextMessage } from '../services/instagramApi';
import { getAccessToken, getConnectedAccount } from '../services/accountService';

const router = Router();

router.use(requireAuth);

router.get('/', async (_req, res, next) => {
  try {
    const conversations = await prisma.conversation.findMany({
      include: {
        contact: true,
        messages: { orderBy: { sentAt: 'desc' }, take: 1 },
      },
      orderBy: [{ lastMessageAt: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
    });

    return res.json({
      conversations: conversations.map((c) => ({
        id: c.id,
        contact: c.contact,
        unreadCount: c.unreadCount,
        status: c.status,
        lastMessageAt: c.lastMessageAt,
        lastMessage: c.messages[0] ?? null,
      })),
    });
  } catch (err) {
    return next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const conversation = await prisma.conversation.findUnique({
      where: { id: req.params.id },
      include: { contact: true },
    });
    if (!conversation) throw new AppError('Suhbat topilmadi', 404);
    return res.json({ conversation });
  } catch (err) {
    return next(err);
  }
});

router.get('/:id/messages', async (req, res, next) => {
  try {
    const conversation = await prisma.conversation.findUnique({
      where: { id: req.params.id },
      select: { id: true },
    });
    if (!conversation) throw new AppError('Suhbat topilmadi', 404);

    // Oxirgi 200 ta xabar, eskidan yangiga tartiblab qaytariladi.
    const messages = await prisma.message.findMany({
      where: { conversationId: conversation.id },
      orderBy: { sentAt: 'desc' },
      take: 200,
    });

    return res.json({ messages: messages.reverse() });
  } catch (err) {
    return next(err);
  }
});

const sendMessageSchema = z.object({
  text: z.string().trim().min(1, 'Xabar bosh bolishi mumkin emas').max(1000, 'Xabar 1000 belgidan oshmasligi kerak'),
});

router.post('/:id/messages', validateBody(sendMessageSchema), async (req, res, next) => {
  try {
    const { text } = req.body as z.infer<typeof sendMessageSchema>;

    const conversation = await prisma.conversation.findUnique({
      where: { id: req.params.id },
      include: { contact: true },
    });
    if (!conversation) throw new AppError('Suhbat topilmadi', 404);

    const account = await getConnectedAccount();
    if (!account) {
      throw new AppError('Instagram akkaunt ulanmagan. Avval akkauntni ulang', 400);
    }

    // Avval SENDING statusida saqlaymiz, API muvaffaqiyatli bolsa SENT qilamiz.
    const pending = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        senderType: SenderType.ADMIN,
        text,
        status: 'SENDING',
        sentAt: new Date(),
      },
    });

    try {
      const result = await sendTextMessage(
        getAccessToken(account),
        conversation.contact.instagramScopedId,
        text,
      );

      const [message] = await Promise.all([
        prisma.message.update({
          where: { id: pending.id },
          data: { status: 'SENT', instagramMessageId: result.messageId },
        }),
        prisma.conversation.update({
          where: { id: conversation.id },
          data: { lastMessageAt: pending.sentAt },
        }),
      ]);

      return res.status(201).json({ message });
    } catch (sendErr) {
      await prisma.message
        .update({ where: { id: pending.id }, data: { status: 'FAILED' } })
        .catch(() => {});
      throw sendErr;
    }
  } catch (err) {
    return next(err);
  }
});

router.post('/:id/read', async (req, res, next) => {
  try {
    const conversation = await prisma.conversation.findUnique({
      where: { id: req.params.id },
      select: { id: true },
    });
    if (!conversation) throw new AppError('Suhbat topilmadi', 404);

    const updated = await prisma.conversation.update({
      where: { id: conversation.id },
      data: { unreadCount: 0 },
    });

    return res.json({ ok: true, conversation: { id: updated.id, unreadCount: updated.unreadCount } });
  } catch (err) {
    return next(err);
  }
});

export default router;

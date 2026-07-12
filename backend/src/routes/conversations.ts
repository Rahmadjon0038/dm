import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { SenderType } from '@prisma/client';
import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { env } from '../config/env';
import { AppError } from '../lib/errors';
import { requireAuth } from '../middleware/auth';
import { validateBody } from '../middleware/validate';
import { sendAttachmentMessage, sendReaction, sendTextMessage } from '../services/instagramApi';
import { getAccessToken, getConnectedAccount } from '../services/accountService';

export const UPLOAD_DIR = path.resolve(process.cwd(), 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// Instagram Send API faqat rasm/video/audio qabul qiladi.
const ALLOWED_MIME: Record<string, 'image' | 'video' | 'audio'> = {
  'image/jpeg': 'image',
  'image/png': 'image',
  'image/gif': 'image',
  'image/webp': 'image',
  'video/mp4': 'video',
  'video/quicktime': 'video',
  'video/webm': 'video',
  'audio/mpeg': 'audio',
  'audio/mp4': 'audio',
  'audio/wav': 'audio',
  'audio/ogg': 'audio',
};

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).slice(0, 10) || '';
      cb(null, `${crypto.randomUUID()}${ext}`);
    },
  }),
  limits: { fileSize: 25 * 1024 * 1024 }, // Instagram video limiti 25 MB
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_MIME[file.mimetype]) return cb(null, true);
    cb(new AppError('Faqat rasm (jpg/png/gif/webp), video (mp4/mov/webm) yoki audio yuborish mumkin', 400));
  },
});

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

// Rasm/video/audio yuborish. Fayl serverda saqlanadi va public URL orqali Instagramga uzatiladi.
router.post('/:id/attachments', upload.single('file'), async (req, res, next) => {
  try {
    const file = req.file;
    if (!file) throw new AppError('Fayl yuborilmadi', 400);

    const conversation = await prisma.conversation.findUnique({
      where: { id: req.params.id },
      include: { contact: true },
    });
    if (!conversation) throw new AppError('Suhbat topilmadi', 404);

    const account = await getConnectedAccount();
    if (!account) throw new AppError('Instagram akkaunt ulanmagan. Avval akkauntni ulang', 400);

    // Meta faylni shu URL orqali yuklab oladi — BACKEND_URL internetdan ochiq bolishi shart.
    if (!env.BACKEND_URL) {
      throw new AppError('BACKEND_URL sozlanmagan — fayl yuborish uchun .env da korsating', 500);
    }
    const publicUrl = `${env.BACKEND_URL.replace(/\/$/, '')}/uploads/${file.filename}`;
    const attachmentType = ALLOWED_MIME[file.mimetype];

    const pending = await prisma.message.create({
      data: {
        conversationId: conversation.id,
        senderType: SenderType.ADMIN,
        attachmentType,
        attachmentUrl: publicUrl,
        status: 'SENDING',
        sentAt: new Date(),
      },
    });

    try {
      const result = await sendAttachmentMessage(
        getAccessToken(account),
        conversation.contact.instagramScopedId,
        attachmentType,
        publicUrl,
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

const reactSchema = z.object({
  action: z.enum(['react', 'unreact']),
});

// Kontakt xabariga ❤️ reaksiya qoyish/olib tashlash.
router.post('/:id/messages/:messageId/react', validateBody(reactSchema), async (req, res, next) => {
  try {
    const { action } = req.body as z.infer<typeof reactSchema>;

    const message = await prisma.message.findUnique({
      where: { id: req.params.messageId },
      include: { conversation: { include: { contact: true } } },
    });
    if (!message || message.conversationId !== req.params.id) {
      throw new AppError('Xabar topilmadi', 404);
    }
    if (!message.instagramMessageId) {
      throw new AppError('Bu xabarga reaksiya qoyib bolmaydi', 400);
    }
    if (message.senderType !== SenderType.CONTACT) {
      throw new AppError('Faqat mijoz xabariga reaksiya qoyish mumkin', 400);
    }

    const account = await getConnectedAccount();
    if (!account) throw new AppError('Instagram akkaunt ulanmagan', 400);

    await sendReaction(
      getAccessToken(account),
      message.conversation.contact.instagramScopedId,
      message.instagramMessageId,
      action,
    );

    const updated = await prisma.message.update({
      where: { id: message.id },
      data: { adminReaction: action === 'react' ? 'love' : null },
    });

    return res.json({ message: updated });
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

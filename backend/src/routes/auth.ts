import bcrypt from 'bcryptjs';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import jwt, { SignOptions } from 'jsonwebtoken';
import { z } from 'zod';
import { env } from '../config/env';
import { prisma } from '../lib/prisma';
import { AuthenticatedRequest, requireAuth } from '../middleware/auth';
import { validateBody } from '../middleware/validate';

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Juda kop urinish. 15 daqiqadan keyin qayta urinib koring' },
});

const loginSchema = z.object({
  email: z.string().email('Email notogri'),
  password: z.string().min(1, 'Parol kiritilishi shart'),
});

router.post('/login', loginLimiter, validateBody(loginSchema), async (req, res, next) => {
  try {
    const { email, password } = req.body as z.infer<typeof loginSchema>;

    const admin = await prisma.admin.findUnique({ where: { email: email.toLowerCase() } });
    const passwordOk = admin ? await bcrypt.compare(password, admin.passwordHash) : false;
    if (!admin || !passwordOk) {
      return res.status(401).json({ error: 'Email yoki parol notogri' });
    }

    const token = jwt.sign({ adminId: admin.id }, env.JWT_SECRET, {
      expiresIn: env.JWT_EXPIRES_IN,
    } as SignOptions);

    return res.json({
      token,
      admin: { id: admin.id, email: admin.email },
    });
  } catch (err) {
    return next(err);
  }
});

router.get('/me', requireAuth, async (req: AuthenticatedRequest, res, next) => {
  try {
    const admin = await prisma.admin.findUnique({
      where: { id: req.adminId },
      select: { id: true, email: true, createdAt: true },
    });
    if (!admin) {
      return res.status(401).json({ error: 'Admin topilmadi' });
    }
    return res.json({ admin });
  } catch (err) {
    return next(err);
  }
});

export default router;

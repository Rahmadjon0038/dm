import cors from 'cors';
import express, { Request } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { env } from './config/env';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import authRoutes from './routes/auth';
import conversationRoutes, { UPLOAD_DIR } from './routes/conversations';
import instagramRoutes from './routes/instagram';
import webhookRoutes from './routes/webhooks';

export function createApp() {
  const app = express();

  // Nginx orqasida ishlaganda haqiqiy IP rate limiting uchun kerak.
  app.set('trust proxy', 1);

  app.use(helmet());

  // Yuborilgan media fayllar: Meta serverlari va frontend boshqa domendan oqiydi,
  // shuning uchun cross-origin ruxsati alohida beriladi.
  app.use(
    '/uploads',
    (_req, res, next) => {
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      next();
    },
    express.static(UPLOAD_DIR, { maxAge: '30d', immutable: true }),
  );
  app.use(
    cors({
      origin: env.FRONTEND_URL,
      credentials: true,
    }),
  );

  // rawBody webhook imzosini (X-Hub-Signature-256) tekshirish uchun saqlanadi.
  app.use(
    express.json({
      limit: '2mb',
      verify: (req: Request & { rawBody?: Buffer }, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );

  // Umumiy rate limit. Webhooklar Meta tomonidan yuboriladi — ular chegaralanmaydi.
  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 300,
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => req.path.startsWith('/api/webhooks'),
    message: { error: 'Juda kop sorov yuborildi. Birozdan keyin qayta urinib koring' },
  });
  app.use(apiLimiter);

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  app.use('/api/auth', authRoutes);
  app.use('/api/instagram', instagramRoutes);
  app.use('/api/webhooks', webhookRoutes);
  app.use('/api/conversations', conversationRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

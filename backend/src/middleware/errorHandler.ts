import { NextFunction, Request, Response } from 'express';
import { AppError, InstagramApiError } from '../lib/errors';
import { isProduction } from '../config/env';

export function notFoundHandler(_req: Request, res: Response) {
  res.status(404).json({ error: 'Endpoint topilmadi' });
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ error: err.message });
  }

  if (err instanceof InstagramApiError) {
    return res.status(err.statusCode).json({
      error: err.message,
      source: 'instagram_api',
      metaCode: err.metaCode,
    });
  }

  // Kutilmagan xato — token kabi sezgir malumotlar loglanmasligi uchun faqat message chiqariladi.
  const message = err instanceof Error ? err.message : 'Nomalum xato';
  console.error(`[error] ${message}`);
  if (!isProduction && err instanceof Error && err.stack) {
    console.error(err.stack);
  }

  return res.status(500).json({ error: 'Serverda ichki xato yuz berdi' });
}

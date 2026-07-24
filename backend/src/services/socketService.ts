import http from 'http';
import jwt from 'jsonwebtoken';
import { Server } from 'socket.io';
import { env, getAllowedOrigins } from '../config/env';

let io: Server | null = null;

export function initSocket(server: http.Server) {
  io = new Server(server, {
    cors: {
      origin: getAllowedOrigins(),
      credentials: true,
    },
  });

  // Faqat login qilgan admin socket orqali ulanadi.
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token || typeof token !== 'string') {
      return next(new Error('Avtorizatsiya talab qilinadi'));
    }
    try {
      jwt.verify(token, env.JWT_SECRET);
      return next();
    } catch {
      return next(new Error('Token yaroqsiz'));
    }
  });

  io.on('connection', (socket) => {
    socket.on('disconnect', () => {});
  });

  return io;
}

export function emitNewMessage(payload: unknown) {
  io?.emit('new_message', payload);
}

// Mavjud xabar ozgarganda (masalan, kontakt reaksiya qoyganda).
export function emitMessageUpdated(payload: unknown) {
  io?.emit('message_updated', payload);
}

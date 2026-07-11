import http from 'http';
import { createApp } from './app';
import { env } from './config/env';
import { prisma } from './lib/prisma';
import { initSocket } from './services/socketService';

async function main() {
  const app = createApp();
  const server = http.createServer(app);

  initSocket(server);

  server.listen(env.PORT, () => {
    console.log(`[server] Backend ${env.PORT}-portda ishga tushdi (${env.NODE_ENV})`);
  });

  const shutdown = async (signal: string) => {
    console.log(`[server] ${signal} qabul qilindi, server toxtatilmoqda...`);
    server.close(async () => {
      await prisma.$disconnect();
      process.exit(0);
    });
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  console.error('[server] Ishga tushirishda xato:', err instanceof Error ? err.message : err);
  process.exit(1);
});

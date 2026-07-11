import { InstagramAccount } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { decryptToken } from '../lib/crypto';
import { AppError } from '../lib/errors';

// MVP: bitta Instagram akkaunt ishlatiladi.
export async function getAccount(): Promise<InstagramAccount | null> {
  return prisma.instagramAccount.findFirst({ orderBy: { createdAt: 'asc' } });
}

export async function getConnectedAccount(): Promise<InstagramAccount | null> {
  const account = await getAccount();
  if (!account || !account.isConnected || !account.encryptedAccessToken) return null;
  return account;
}

export function getAccessToken(account: InstagramAccount): string {
  if (!account.encryptedAccessToken) {
    throw new AppError('Instagram akkaunt uchun access token saqlanmagan', 400);
  }
  return decryptToken(account.encryptedAccessToken);
}

// Frontendga qaytariladigan xavfsiz korinish — token hech qachon qaytarilmaydi.
export function toPublicAccount(account: InstagramAccount) {
  return {
    id: account.id,
    instagramAccountId: account.instagramAccountId,
    username: account.username,
    name: account.name,
    profilePictureUrl: account.profilePictureUrl,
    accountType: account.accountType,
    isConnected: account.isConnected,
    hasToken: Boolean(account.encryptedAccessToken),
    tokenExpiresAt: account.tokenExpiresAt,
    createdAt: account.createdAt,
    updatedAt: account.updatedAt,
  };
}

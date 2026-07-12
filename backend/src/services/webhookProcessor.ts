import { Prisma, SenderType } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../lib/prisma';
import { fetchContactProfile } from './instagramApi';
import { getAccessToken, getConnectedAccount } from './accountService';
import { emitNewMessage } from './socketService';

// Instagram webhook payloadining bizga kerakli qismi.
// Nomalum maydonlar passthrough qilinadi — Meta yangi maydon qoshsa parse buzilmaydi.
const attachmentSchema = z
  .object({
    type: z.string().optional(),
    payload: z.object({ url: z.string().optional() }).partial().optional(),
  })
  .passthrough();

const messagingEventSchema = z
  .object({
    sender: z.object({ id: z.string() }).optional(),
    recipient: z.object({ id: z.string() }).optional(),
    timestamp: z.union([z.number(), z.string()]).optional(),
    message: z
      .object({
        mid: z.string(),
        text: z.string().optional(),
        is_echo: z.boolean().optional(),
        attachments: z.array(attachmentSchema).optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

// Meta Dashboard'dagi "Test" tugmasi eventni entry[].changes[] formatida yuboradi,
// jonli xabarlar esa entry[].messaging[] da keladi — ikkalasini ham qabul qilamiz.
const changeSchema = z
  .object({
    field: z.string().optional(),
    value: messagingEventSchema.optional(),
  })
  .passthrough();

const webhookPayloadSchema = z
  .object({
    object: z.string(),
    entry: z.array(
      z
        .object({
          id: z.string().optional(),
          time: z.number().optional(),
          messaging: z.array(messagingEventSchema).optional(),
          changes: z.array(changeSchema).optional(),
        })
        .passthrough(),
    ),
  })
  .passthrough();

type MessagingEvent = z.infer<typeof messagingEventSchema>;

export async function processWebhookPayload(rawPayload: unknown): Promise<void> {
  const parsed = webhookPayloadSchema.safeParse(rawPayload);
  if (!parsed.success) {
    console.warn('[webhook] Payload strukturasi notogri, otkazib yuborildi');
    return;
  }
  if (parsed.data.object !== 'instagram') {
    console.warn(`[webhook] Notanish object turi: ${parsed.data.object}, otkazib yuborildi`);
    return;
  }

  for (const entry of parsed.data.entry) {
    const events = [
      ...(entry.messaging ?? []),
      ...(entry.changes ?? [])
        .filter((c) => c.field === 'messages' && c.value)
        .map((c) => c.value!),
    ];

    console.log(`[webhook] Event qabul qilindi (entry: ${entry.id ?? '-'}, xabarlar: ${events.length})`);

    for (const event of events) {
      try {
        await processMessagingEvent(event);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[webhook] Eventni qayta ishlashda xato: ${message}`);
      }
    }
  }
}

async function processMessagingEvent(event: MessagingEvent): Promise<void> {
  const message = event.message;
  if (!message?.mid) {
    // mid yoq — bu message emas (read/seen/reaction va h.k.)
    const keys = Object.keys(event).filter((k) => !['sender', 'recipient', 'timestamp'].includes(k));
    console.log(`[webhook] Message bomagan event otkazib yuborildi (maydonlar: ${keys.join(', ') || '-'})`);
    return;
  }

  // is_echo — biznes akkaunt yuborgan xabar (Instagram ilovasidan yoki API orqali).
  // Echo eventda sender = biznes, recipient = foydalanuvchi.
  const isEcho = Boolean(message.is_echo);
  const contactIgsid = isEcho ? event.recipient?.id : event.sender?.id;
  console.log(
    `[webhook] Message eventi: mid=${message.mid.slice(0, 24)}… sender=${event.sender?.id ?? '-'} recipient=${event.recipient?.id ?? '-'} echo=${isEcho} text=${message.text ? 'bor' : 'yoq'}`,
  );
  if (!contactIgsid) {
    console.warn('[webhook] Kontakt IGSID aniqlanmadi, xabar saqlanmadi');
    return;
  }

  // Dublikatni erta aniqlash (API orqali yuborilgan xabar echo bolib qaytadi).
  const existing = await prisma.message.findUnique({
    where: { instagramMessageId: message.mid },
    select: { id: true },
  });
  if (existing) {
    console.log(`[webhook] Dublikat xabar otkazib yuborildi (mid=${message.mid.slice(0, 24)}…)`);
    return;
  }

  const account = await getConnectedAccount();
  if (!account) {
    console.warn('[webhook] Ulangan Instagram akkaunt yoq, xabar saqlanmadi');
    return;
  }

  // Kontaktni topish yoki yaratish.
  let contact = await prisma.contact.findUnique({ where: { instagramScopedId: contactIgsid } });
  if (!contact) {
    contact = await prisma.contact.create({ data: { instagramScopedId: contactIgsid } });

    // Profil malumotlarini olishga harakat qilamiz; olinmasa ham davom etamiz.
    try {
      const profile = await fetchContactProfile(getAccessToken(account), contactIgsid);
      if (profile) {
        contact = await prisma.contact.update({
          where: { id: contact.id },
          data: {
            name: profile.name ?? contact.name,
            username: profile.username ?? contact.username,
            profilePictureUrl: profile.profilePictureUrl ?? contact.profilePictureUrl,
          },
        });
      }
    } catch {
      // profil olinmasa ham xabar saqlanadi
    }
  }

  const conversation = await prisma.conversation.upsert({
    where: {
      instagramAccountId_contactId: {
        instagramAccountId: account.id,
        contactId: contact.id,
      },
    },
    create: { instagramAccountId: account.id, contactId: contact.id },
    update: {},
  });

  // Meta jonli eventlarda timestampni millisekundda, test payloadda sekundda yuboradi.
  const rawTs = Number(event.timestamp);
  const sentAt =
    event.timestamp && Number.isFinite(rawTs)
      ? new Date(rawTs < 1_000_000_000_000 ? rawTs * 1000 : rawTs)
      : new Date();
  const attachment = message.attachments?.[0];

  let saved;
  try {
    saved = await prisma.message.create({
      data: {
        instagramMessageId: message.mid,
        conversationId: conversation.id,
        senderType: isEcho ? SenderType.ADMIN : SenderType.CONTACT,
        text: message.text ?? null,
        attachmentType: attachment?.type ?? null,
        attachmentUrl: attachment?.payload?.url ?? null,
        status: isEcho ? 'SENT' : 'RECEIVED',
        sentAt,
      },
    });
  } catch (err) {
    // Parallel webhooklar orasida unique constraint dublikatni ushlab qoladi.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') return;
    throw err;
  }

  const [updatedConversation] = await Promise.all([
    prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        lastMessageAt: sentAt,
        ...(isEcho ? {} : { unreadCount: { increment: 1 } }),
      },
      include: { contact: true },
    }),
    prisma.contact.update({
      where: { id: contact.id },
      data: { lastMessageAt: sentAt },
    }),
  ]);

  console.log(
    `[webhook] Xabar saqlandi (conversation=${conversation.id}, senderType=${saved.senderType}, sentAt=${saved.sentAt.toISOString()})`,
  );

  emitNewMessage({
    conversationId: conversation.id,
    message: saved,
    conversation: {
      id: updatedConversation.id,
      unreadCount: updatedConversation.unreadCount,
      lastMessageAt: updatedConversation.lastMessageAt,
      contact: updatedConversation.contact,
    },
  });
}

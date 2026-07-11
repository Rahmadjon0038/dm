'use client';

import { formatDateTime } from '@/lib/format';
import { Message } from '@/lib/types';

export default function MessageBubble({ message }: { message: Message }) {
  const isAdmin = message.senderType === 'ADMIN';
  const isImage = message.attachmentType === 'image';
  const isVideo = message.attachmentType === 'video';

  return (
    <div className={`flex ${isAdmin ? 'justify-end' : 'justify-start'}`}>
      <div
        className={`max-w-md rounded-2xl px-3.5 py-2 text-sm ${
          isAdmin
            ? 'rounded-br-sm bg-brand-600 text-white'
            : 'rounded-bl-sm border border-gray-200 bg-white text-gray-900'
        }`}
      >
        {message.attachmentUrl && (
          <div className="mb-1.5 overflow-hidden rounded-lg">
            {isImage ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={message.attachmentUrl}
                alt="Rasm"
                className="max-h-64 w-full object-cover"
              />
            ) : isVideo ? (
              <video src={message.attachmentUrl} controls className="max-h-64 w-full" />
            ) : (
              <a
                href={message.attachmentUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={`text-xs underline ${isAdmin ? 'text-white' : 'text-brand-600'}`}
              >
                📎 Faylni ochish
              </a>
            )}
          </div>
        )}

        {message.text && <p className="whitespace-pre-wrap break-words">{message.text}</p>}

        <div
          className={`mt-1 flex items-center gap-1.5 text-[11px] ${
            isAdmin ? 'text-brand-100' : 'text-gray-400'
          }`}
        >
          <span>{formatDateTime(message.sentAt)}</span>
          {message.status === 'FAILED' && <span className="text-red-300">· Yuborilmadi</span>}
          {message.status === 'SENDING' && <span>· Yuborilmoqda</span>}
        </div>
      </div>
    </div>
  );
}

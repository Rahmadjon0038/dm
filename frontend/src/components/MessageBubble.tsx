'use client';

import { AlertCircle, Check, Clock, FileText, Heart } from 'lucide-react';
import { formatDateTime } from '@/lib/format';
import { Message } from '@/lib/types';

interface Props {
  message: Message;
  onReact?: (message: Message, action: 'react' | 'unreact') => void;
  reactPending?: boolean;
}

export default function MessageBubble({ message, onReact, reactPending }: Props) {
  const isAdmin = message.senderType === 'ADMIN';
  const isImage = message.attachmentType === 'image';
  const isVideo = message.attachmentType === 'video';
  const isAudio = message.attachmentType === 'audio';
  // Instagramdagi tez yurak (like) stikeri URLsiz keladi.
  const isHeartSticker = message.attachmentType === 'like_heart';

  const hasReacted = Boolean(message.adminReaction);
  const canReact = !isAdmin && Boolean(message.instagramMessageId) && onReact;
  // Bubble burchagida korinadigan reaksiya: admin xabariga kontakt qoygani yoki aksincha.
  const shownReaction = isAdmin ? message.contactReaction : message.adminReaction;

  return (
    <div className={`group flex items-end gap-1.5 ${isAdmin ? 'justify-end' : 'justify-start'}`}>
      <div className={`relative max-w-md ${shownReaction ? 'mb-2.5' : ''}`}>
        <div
          className={`rounded-2xl px-3.5 py-2 text-sm shadow-sm ${
            isAdmin
              ? 'rounded-br-sm bg-brand-600 text-white'
              : 'rounded-bl-sm border border-gray-200 bg-white text-gray-900'
          }`}
        >
          {isHeartSticker && <span className="text-4xl leading-none">❤️</span>}

          {message.attachmentUrl && (
            <div className="mb-1.5 overflow-hidden rounded-lg">
              {isImage ? (
                <a href={message.attachmentUrl} target="_blank" rel="noopener noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={message.attachmentUrl}
                    alt="Rasm"
                    className="max-h-64 w-full object-cover"
                  />
                </a>
              ) : isVideo ? (
                <video src={message.attachmentUrl} controls className="max-h-64 w-full" />
              ) : isAudio ? (
                <audio src={message.attachmentUrl} controls className="w-60" />
              ) : (
                <a
                  href={message.attachmentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`flex items-center gap-1.5 text-xs underline ${
                    isAdmin ? 'text-white' : 'text-brand-600'
                  }`}
                >
                  <FileText size={14} />
                  Faylni ochish
                </a>
              )}
            </div>
          )}

          {message.text && <p className="whitespace-pre-wrap break-words">{message.text}</p>}

          {/* Matn ham, media ham bolmagan xabar (masalan qollab-quvvatlanmaydigan tur) */}
          {!message.text && !message.attachmentUrl && !isHeartSticker && (
            <p className={`italic ${isAdmin ? 'text-brand-100' : 'text-gray-400'}`}>
              Qo&apos;llab-quvvatlanmaydigan xabar
            </p>
          )}

          <div
            className={`mt-1 flex items-center gap-1 text-[11px] ${
              isAdmin ? 'text-brand-100' : 'text-gray-400'
            }`}
          >
            <span>{formatDateTime(message.sentAt)}</span>
            {isAdmin && message.status === 'SENT' && <Check size={12} />}
            {isAdmin && message.status === 'SENDING' && <Clock size={12} />}
            {isAdmin && message.status === 'FAILED' && (
              <span className="flex items-center gap-0.5 text-red-300">
                <AlertCircle size={12} /> Yuborilmadi
              </span>
            )}
          </div>
        </div>

        {/* Bubble burchagidagi reaksiya belgisi */}
        {shownReaction && (
          <span
            className={`absolute -bottom-2.5 flex h-5 items-center rounded-full border border-gray-200 bg-white px-1.5 text-xs shadow-sm ${
              isAdmin ? 'right-2' : 'left-2'
            }`}
          >
            {shownReaction === 'love' ? '❤️' : shownReaction}
          </span>
        )}
      </div>

      {/* Kontakt xabari ustiga hover qilganda chiqadigan reaksiya tugmasi */}
      {canReact && (
        <button
          type="button"
          disabled={reactPending}
          onClick={() => onReact!(message, hasReacted ? 'unreact' : 'react')}
          title={hasReacted ? 'Reaksiyani olib tashlash' : "❤️ qo'yish"}
          className={`mb-1 rounded-full p-1.5 transition disabled:opacity-40 ${
            hasReacted
              ? 'text-red-500 opacity-100 hover:bg-red-50'
              : 'text-gray-400 opacity-0 hover:bg-gray-100 hover:text-red-500 group-hover:opacity-100'
          }`}
        >
          <Heart size={15} fill={hasReacted ? 'currentColor' : 'none'} />
        </button>
      )}
    </div>
  );
}

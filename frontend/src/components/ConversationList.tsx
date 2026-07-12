'use client';

import { Inbox } from 'lucide-react';
import Avatar from './Avatar';
import { contactDisplayName, formatTime } from '@/lib/format';
import { ConversationListItem } from '@/lib/types';

interface Props {
  conversations: ConversationListItem[];
  isLoading: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function lastMessagePreview(item: ConversationListItem): string {
  const msg = item.lastMessage;
  if (!msg) return 'Xabar yoq';
  if (msg.text) return msg.text;
  if (msg.attachmentType === 'image') return '📷 Rasm';
  if (msg.attachmentType === 'video') return '🎬 Video';
  if (msg.attachmentType === 'audio') return '🎵 Audio';
  if (msg.attachmentType === 'like_heart') return '❤️';
  if (msg.attachmentType) return '📎 Fayl';
  return 'Xabar';
}

export default function ConversationList({ conversations, isLoading, selectedId, onSelect }: Props) {
  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-gray-200 px-4 py-4">
        <h2 className="text-base font-semibold">Inbox</h2>
      </div>

      <div className="flex-1 overflow-y-auto">
        {isLoading && <p className="px-4 py-6 text-center text-sm text-gray-400">Yuklanmoqda...</p>}

        {!isLoading && conversations.length === 0 && (
          <div className="flex flex-col items-center gap-2 px-4 py-10 text-center text-gray-400">
            <Inbox size={28} strokeWidth={1.5} />
            <p className="text-sm">
              Hozircha suhbatlar yoq. Instagram akkauntga DM kelganda shu yerda korinadi.
            </p>
          </div>
        )}

        {conversations.map((item) => {
          const active = item.id === selectedId;
          const name = contactDisplayName(item.contact);
          return (
            <button
              key={item.id}
              onClick={() => onSelect(item.id)}
              className={`flex w-full items-center gap-3 border-b border-gray-100 px-4 py-3 text-left transition ${
                active ? 'bg-brand-50' : 'hover:bg-gray-50'
              }`}
            >
              <Avatar src={item.contact.profilePictureUrl} name={name} size={44} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium">{name}</span>
                  <span className="shrink-0 text-xs text-gray-400">
                    {formatTime(item.lastMessageAt)}
                  </span>
                </div>
                <div className="mt-0.5 flex items-center justify-between gap-2">
                  <span className="truncate text-xs text-gray-500">{lastMessagePreview(item)}</span>
                  {item.unreadCount > 0 && (
                    <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-brand-600 px-1.5 text-xs font-medium text-white">
                      {item.unreadCount}
                    </span>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

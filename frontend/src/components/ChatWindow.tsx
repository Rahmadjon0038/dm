'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useEffect, useRef, useState } from 'react';
import Avatar from './Avatar';
import MessageBubble from './MessageBubble';
import { api, getErrorMessage } from '@/lib/api';
import { contactDisplayName } from '@/lib/format';
import { ConversationListItem, Message } from '@/lib/types';

interface Props {
  conversation: ConversationListItem;
}

export default function ChatWindow({ conversation }: Props) {
  const queryClient = useQueryClient();
  const [text, setText] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  const messagesQuery = useQuery({
    queryKey: ['messages', conversation.id],
    queryFn: async () => {
      const { data } = await api.get<{ messages: Message[] }>(
        `/conversations/${conversation.id}/messages`,
      );
      return data.messages;
    },
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'auto' });
  }, [messagesQuery.data?.length, conversation.id]);

  const sendMutation = useMutation({
    mutationFn: async (messageText: string) => {
      const { data } = await api.post<{ message: Message }>(
        `/conversations/${conversation.id}/messages`,
        { text: messageText },
      );
      return data.message;
    },
    onSuccess: (message) => {
      setText('');
      queryClient.setQueryData<Message[]>(['messages', conversation.id], (old) => {
        if (!old) return [message];
        if (old.some((m) => m.id === message.id)) return old;
        return [...old, message];
      });
      queryClient.invalidateQueries({ queryKey: ['conversations'] });
    },
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || sendMutation.isPending) return;
    sendMutation.mutate(trimmed);
  };

  const name = contactDisplayName(conversation.contact);

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 border-b border-gray-200 bg-white px-5 py-3">
        <Avatar src={conversation.contact.profilePictureUrl} name={name} size={38} />
        <div>
          <p className="text-sm font-semibold">{name}</p>
          {conversation.contact.username && (
            <p className="text-xs text-gray-500">@{conversation.contact.username}</p>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4">
        {messagesQuery.isLoading && (
          <p className="py-6 text-center text-sm text-gray-400">Yuklanmoqda...</p>
        )}
        {messagesQuery.isError && (
          <p className="py-6 text-center text-sm text-red-500">
            {getErrorMessage(messagesQuery.error)}
          </p>
        )}
        <div className="space-y-2">
          {messagesQuery.data?.map((message) => (
            <MessageBubble key={message.id} message={message} />
          ))}
        </div>
        <div ref={bottomRef} />
      </div>

      <form onSubmit={handleSubmit} className="border-t border-gray-200 bg-white px-4 py-3">
        {sendMutation.isError && (
          <p className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
            {getErrorMessage(sendMutation.error)}
          </p>
        )}
        <div className="flex items-end gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSubmit(e);
              }
            }}
            rows={1}
            placeholder="Xabar yozing..."
            className="max-h-32 flex-1 resize-none rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
          />
          <button
            type="submit"
            disabled={!text.trim() || sendMutation.isPending}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-50"
          >
            {sendMutation.isPending ? 'Yuborilmoqda...' : 'Yuborish'}
          </button>
        </div>
      </form>
    </div>
  );
}

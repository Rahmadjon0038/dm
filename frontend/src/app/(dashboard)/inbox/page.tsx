'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import ChatWindow from '@/components/ChatWindow';
import ConversationList from '@/components/ConversationList';
import { api } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { ConversationListItem, Message, NewMessageEvent } from '@/lib/types';

export default function InboxPage() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const conversationsQuery = useQuery({
    queryKey: ['conversations'],
    queryFn: async () => {
      const { data } = await api.get<{ conversations: ConversationListItem[] }>('/conversations');
      return data.conversations;
    },
    // Socket uzilib qolgan holatlar uchun zaxira yangilanish.
    refetchInterval: 30_000,
  });

  // Socket.IO: yangi xabar kelganda ochiq suhbat va royxatni yangilaydi.
  useEffect(() => {
    const socket = getSocket();

    const onNewMessage = (event: NewMessageEvent) => {
      queryClient.setQueryData<Message[]>(['messages', event.conversationId], (old) => {
        if (!old) return old;
        if (old.some((m) => m.id === event.message.id)) return old;
        return [...old, event.message];
      });
      // Ochiq suhbatga kelgan xabar darhol oqilgan deb belgilanadi.
      if (event.conversationId === selectedId && event.message.senderType === 'CONTACT') {
        api
          .post(`/conversations/${event.conversationId}/read`)
          .catch(() => {})
          .finally(() => queryClient.invalidateQueries({ queryKey: ['conversations'] }));
        queryClient.setQueryData<ConversationListItem[]>(['conversations'], (old) =>
          old?.map((c) =>
            c.id === event.conversationId
              ? { ...c, unreadCount: 0, lastMessage: event.message, lastMessageAt: event.message.sentAt }
              : c,
          ),
        );
      } else {
        queryClient.invalidateQueries({ queryKey: ['conversations'] });
      }
    };

    socket.on('new_message', onNewMessage);
    return () => {
      socket.off('new_message', onNewMessage);
    };
  }, [queryClient, selectedId]);

  const handleSelect = (id: string) => {
    setSelectedId(id);
    api.post(`/conversations/${id}/read`).catch(() => {});
    queryClient.setQueryData<ConversationListItem[]>(['conversations'], (old) =>
      old?.map((c) => (c.id === id ? { ...c, unreadCount: 0 } : c)),
    );
  };

  const selected = conversationsQuery.data?.find((c) => c.id === selectedId) ?? null;

  return (
    <div className="flex h-full">
      <div className="w-80 shrink-0 border-r border-gray-200 bg-white">
        <ConversationList
          conversations={conversationsQuery.data ?? []}
          isLoading={conversationsQuery.isLoading}
          selectedId={selectedId}
          onSelect={handleSelect}
        />
      </div>
      <div className="flex-1 bg-gray-50">
        {selected ? (
          <ChatWindow conversation={selected} />
        ) : (
          <div className="flex h-full flex-col items-center justify-center text-gray-400">
            <span className="mb-2 text-4xl">💬</span>
            <p className="text-sm">Suhbatni tanlang</p>
          </div>
        )}
      </div>
    </div>
  );
}

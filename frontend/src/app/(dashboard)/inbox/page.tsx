'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { MessagesSquare } from 'lucide-react';
import ChatWindow from '@/components/ChatWindow';
import ConversationList from '@/components/ConversationList';
import { useLocale } from '@/components/LocaleProvider';
import { api } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import { useInstagramAccount } from '@/lib/useInstagramAccount';
import { ConversationListItem, Message, MessageUpdatedEvent, NewMessageEvent } from '@/lib/types';

export default function InboxPage() {
  const { t } = useLocale();
  const queryClient = useQueryClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const accountQuery = useInstagramAccount();

  const accountKey = accountQuery.data?.id ?? 'none';

  const conversationsQuery = useQuery({
    queryKey: ['conversations', accountKey],
    queryFn: async () => {
      const { data } = await api.get<{ conversations: ConversationListItem[] }>('/conversations');
      return data.conversations;
    },
    // Socket uzilib qolgan holatlar uchun zaxira yangilanish.
    refetchInterval: 30_000,
  });

  useEffect(() => {
    setSelectedId(null);
    queryClient.removeQueries({ queryKey: ['messages'] });
    queryClient.invalidateQueries({ queryKey: ['conversations'] });
  }, [accountKey]);

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
        queryClient.setQueryData<ConversationListItem[]>(['conversations', accountKey], (old) =>
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

    // Mavjud xabar yangilanganda (masalan, kontakt reaksiya qoyganda).
    const onMessageUpdated = (event: MessageUpdatedEvent) => {
      queryClient.setQueryData<Message[]>(['messages', event.conversationId], (old) =>
        old?.map((m) => (m.id === event.message.id ? event.message : m)),
      );
    };

    socket.on('new_message', onNewMessage);
    socket.on('message_updated', onMessageUpdated);
    return () => {
      socket.off('new_message', onNewMessage);
      socket.off('message_updated', onMessageUpdated);
    };
  }, [queryClient, selectedId]);

  useEffect(() => {
    const conversationId = searchParams.get('conversation');
    if (conversationId) {
      setSelectedId(conversationId);
    }
  }, [searchParams]);

  // Tanlangan suhbatni URL'ga ham yozib qo'yamiz (masalan /inbox?conversation=xyz), shunda
  // boshqa sahifaga chiqib brauzerning "orqaga" tugmasi bilan qaytilganda ochiq turgan suhbat
  // (searchParams'ni o'qiydigan quyidagi effect orqali) qayta tiklanadi — aks holda selectedId
  // faqat local state bo'lgani uchun sahifa qayta mount bo'lganda yo'qolib, ro'yxat bosh holatda
  // ochilib qolardi. `replace` ishlatiladi (push emas), shunda har bir suhbat almashtirish
  // brauzer tarixiga alohida qadam qo'shib yubormaydi.
  const updateConversationParam = (id: string | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (id) {
      params.set('conversation', id);
    } else {
      params.delete('conversation');
    }
    const query = params.toString();
    router.replace(query ? `/inbox?${query}` : '/inbox', { scroll: false });
  };

  const handleSelect = (id: string) => {
    setSelectedId(id);
    updateConversationParam(id);
    api.post(`/conversations/${id}/read`).catch(() => {});
    queryClient.setQueryData<ConversationListItem[]>(['conversations', accountKey], (old) =>
      old?.map((c) => (c.id === id ? { ...c, unreadCount: 0 } : c)),
    );
  };

  const selected = conversationsQuery.data?.find((c) => c.id === selectedId) ?? null;

  const filteredConversations = useMemo(() => {
    const items = conversationsQuery.data ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return items;

    return items.filter((item) => {
      const name = item.contact.name?.toLowerCase() ?? '';
      const username = item.contact.username?.toLowerCase() ?? '';
      const lastMessage = item.lastMessage?.text?.toLowerCase() ?? '';
      return name.includes(q) || username.includes(q) || lastMessage.includes(q);
    });
  }, [conversationsQuery.data, search]);

  return (
    <div className="flex h-full md:gap-2 lg:gap-3">
      {/* Mobilda faqat bittasi korinadi: suhbat tanlanmagan bolsa royxat, tanlangan bolsa chat.
          md: dan boshlab ikkalasi doim yonma-yon, alohida rounded panel sifatida turadi. */}
      <div
        className={`w-full shrink-0 overflow-hidden bg-white/80 backdrop-blur-xl backdrop-saturate-150 md:block md:w-80 md:rounded-2xl md:border md:border-gray-300 md:shadow-sm dark:bg-tg-sidebar dark:md:border-tg-border/70 ${
          selectedId ? 'hidden md:block' : 'block'
        }`}
      >
        <ConversationList
          conversations={filteredConversations}
          isLoading={conversationsQuery.isLoading}
          selectedId={selectedId}
          onSelect={handleSelect}
          search={search}
          onSearchChange={setSearch}
          hasSearchResults={(conversationsQuery.data ?? []).length > 0 && filteredConversations.length === 0}
        />
      </div>
      <div
        className={`flex-1 overflow-hidden bg-gray-50 dark:bg-tg-bg md:rounded-2xl ${selectedId ? 'block' : 'hidden md:block'}`}
      >
        {selected ? (
          <ChatWindow
            conversation={selected}
            onBack={() => {
              setSelectedId(null);
              updateConversationParam(null);
            }}
            onDeleted={() => {
              setSelectedId(null);
              updateConversationParam(null);
              queryClient.invalidateQueries({ queryKey: ['conversations'] });
            }}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-gray-500 dark:text-tg-textFaint">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gray-100 dark:bg-tg-panelAlt">
              <MessagesSquare size={28} strokeWidth={1.5} />
            </div>
            <p className="text-sm">{t('inbox.selectConversation')}</p>
          </div>
        )}
      </div>
    </div>
  );
}

'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Loader2, MessageCircleMore } from 'lucide-react';
import Avatar from '@/components/Avatar';
import ChatWindow from '@/components/ChatWindow';
import { api, getErrorMessage } from '@/lib/api';
import { contactDisplayName, formatRelativeTime } from '@/lib/format';
import { ConversationListItem } from '@/lib/types';

export default function LeadDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const conversationId = params.id;

  const conversationQuery = useQuery({
    queryKey: ['conversation', conversationId],
    queryFn: async () => {
      const { data } = await api.get<{ conversation: ConversationListItem }>(`/conversations/${conversationId}`);
      return data.conversation;
    },
    enabled: Boolean(conversationId),
  });

  const conversation = conversationQuery.data ?? null;
  const name = conversation ? contactDisplayName(conversation.contact) : '';

  return (
    <div className="h-full overflow-y-auto bg-gray-50 p-3">
      <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col gap-3">
        <div className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 shadow-sm">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href="/leads"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 text-gray-600 transition hover:bg-gray-100"
              aria-label="Orqaga"
            >
              <ArrowLeft size={18} />
            </Link>
            <div className="flex min-w-0 items-center gap-3">
              <Avatar src={conversation?.contact.profilePictureUrl ?? null} name={name || 'Lead'} size={44} />
              <div className="min-w-0">
                <h1 className="truncate text-base font-semibold text-gray-900">
                  {conversation ? name : 'Lead topilmadi'}
                </h1>
                {conversation?.contact.username && (
                  <p className="truncate text-sm text-gray-500">@{conversation.contact.username}</p>
                )}
              </div>
            </div>
          </div>

          {conversation && (
            <div className="hidden items-center gap-2 text-sm text-gray-500 sm:flex">
              <span className="rounded-full border border-gray-200 px-2.5 py-1">
                {formatRelativeTime(conversation.lastMessageAt)}
              </span>
              <span className="rounded-full border border-gray-200 px-2.5 py-1">
                {conversation.status === 'OPEN' ? 'Ochiq' : 'Yopiq'}
              </span>
            </div>
          )}
        </div>

        {conversationQuery.isLoading && (
          <div className="flex min-h-[280px] items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-400 shadow-sm">
            <Loader2 className="mr-2 animate-spin" size={18} />
            Yuklanmoqda...
          </div>
        )}

        {conversationQuery.isError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {getErrorMessage(conversationQuery.error)}
          </div>
        )}

        {!conversationQuery.isLoading && !conversation && !conversationQuery.isError && (
          <div className="flex min-h-[280px] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-gray-200 bg-white px-6 text-center text-gray-500 shadow-sm">
            <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gray-100 text-gray-400">
              <MessageCircleMore size={22} />
            </div>
            <h2 className="text-base font-semibold text-gray-900">Suhbat topilmadi</h2>
            <p className="text-sm text-gray-500">Ushbu lead uchun chat mavjud emas yoki o‘chirib yuborilgan.</p>
            <Link href="/leads" className="text-sm font-medium text-brand-600">
              Leads sahifasiga qaytish
            </Link>
          </div>
        )}

        {conversation && (
          <div className="min-h-[70vh] overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
            <ChatWindow
              conversation={conversation}
              onDeleted={() => {
                queryClient.invalidateQueries({ queryKey: ['conversations'] });
                router.push('/leads');
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}

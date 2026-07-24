'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowUpRight,
  CheckCircle2,
  CircleDashed,
  Loader2,
  MessageCircleMore,
  Search,
  Users,
  XCircle,
} from 'lucide-react';
import Avatar from '@/components/Avatar';
import { api, getErrorMessage } from '@/lib/api';
import { contactDisplayName, formatRelativeTime } from '@/lib/format';
import { getSocket } from '@/lib/socket';
import { ConversationListItem } from '@/lib/types';

type BoardBucketId = 'new' | 'solved' | 'pending' | 'rejected';

const bucketConfig: Record<
  BoardBucketId,
  {
    title: string;
    subtitle: string;
    badgeClass: string;
    panelClass: string;
    emptyClass: string;
    accentClass: string;
    textClass: string;
  }
> = {
  new: {
    title: 'Yangi',
    subtitle: 'Yangi yozganlar',
    badgeClass: 'bg-violet-100 text-violet-700',
    panelClass: 'bg-violet-50',
    emptyClass: 'border-violet-200 bg-violet-50 text-violet-500',
    accentClass: 'bg-violet-500',
    textClass: 'text-violet-700',
  },
  solved: {
    title: "Hal bo'lganlar",
    subtitle: 'Gaplashilganlar',
    badgeClass: 'bg-emerald-100 text-emerald-700',
    panelClass: 'bg-emerald-50',
    emptyClass: 'border-emerald-200 bg-emerald-50 text-emerald-500',
    accentClass: 'bg-emerald-500',
    textClass: 'text-emerald-700',
  },
  pending: {
    title: "Hal bo'lmaganlar",
    subtitle: 'Hali yakunlanmaganlar',
    badgeClass: 'bg-amber-100 text-amber-700',
    panelClass: 'bg-amber-50',
    emptyClass: 'border-amber-200 bg-amber-50 text-amber-500',
    accentClass: 'bg-amber-500',
    textClass: 'text-amber-700',
  },
  rejected: {
    title: 'Rad etganlar',
    subtitle: 'Rad etilganlar',
    badgeClass: 'bg-rose-100 text-rose-700',
    panelClass: 'bg-rose-50',
    emptyClass: 'border-rose-200 bg-rose-50 text-rose-500',
    accentClass: 'bg-rose-500',
    textClass: 'text-rose-700',
  },
};

function lastMessagePreview(item: ConversationListItem): string {
  const msg = item.lastMessage;
  if (!msg) return "Hali xabar yo'q";
  if (msg.text) return msg.text;
  if (msg.attachmentType === 'image') return 'Rasm';
  if (msg.attachmentType === 'video') return 'Video';
  if (msg.attachmentType === 'audio') return 'Audio';
  if (msg.attachmentType) return 'Fayl';
  return 'Xabar';
}

function classifyConversation(item: ConversationListItem): BoardBucketId {
  if (item.status === 'CLOSED' || item.courseDecision === 'WILL_NOT_WRITE') return 'rejected';
  if (item.talkStatus === 'TALKED') return 'solved';
  if (item.leadTemperature === 'HOT' || item.unreadCount > 0) return 'new';
  return 'pending';
}

function sortByLatest(a: ConversationListItem, b: ConversationListItem): number {
  const at = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
  const bt = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
  return bt - at;
}

export default function LeadsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [draggedId, setDraggedId] = useState<string | null>(null);

  const conversationsQuery = useQuery({
    queryKey: ['conversations'],
    queryFn: async () => {
      const { data } = await api.get<{ conversations: ConversationListItem[] }>('/conversations');
      return data.conversations;
    },
    refetchInterval: 30_000,
  });

  useEffect(() => {
    const socket = getSocket();
    const refresh = () => queryClient.invalidateQueries({ queryKey: ['conversations'] });
    socket.on('new_message', refresh);
    socket.on('message_updated', refresh);

    return () => {
      socket.off('new_message', refresh);
      socket.off('message_updated', refresh);
    };
  }, [queryClient]);

  const updateMutation = useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: Partial<Pick<ConversationListItem, 'leadTemperature' | 'talkStatus' | 'courseDecision' | 'status'>>;
    }) => {
      const { data } = await api.patch<{ conversation: ConversationListItem }>(
        `/conversations/${id}/status`,
        patch,
      );
      return data.conversation;
    },
    onMutate: async ({ id, patch }) => {
      await queryClient.cancelQueries({ queryKey: ['conversations'] });
      const previous = queryClient.getQueryData<ConversationListItem[]>(['conversations']);
      queryClient.setQueryData<ConversationListItem[]>(['conversations'], (old) =>
        old?.map((item) => (item.id === id ? { ...item, ...patch } : item)),
      );
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(['conversations'], context.previous);
      }
    },
    onSuccess: (updated) => {
      queryClient.setQueryData<ConversationListItem[]>(['conversations'], (old) =>
        old?.map((item) => (item.id === updated.id ? updated : item)),
      );
    },
  });

  const visibleConversations = useMemo(() => {
    const items = conversationsQuery.data ?? [];
    const q = search.trim().toLowerCase();

    return items
      .filter((item) => {
        if (!q) return true;

        const haystack = [
          contactDisplayName(item.contact),
          item.contact.username ?? '',
          item.contact.name ?? '',
          item.lastMessage?.text ?? '',
          item.lastMessage?.attachmentType ?? '',
          item.leadTemperature,
          item.talkStatus,
          item.courseDecision,
          item.status,
        ]
          .join(' ')
          .toLowerCase();

        return haystack.includes(q);
      })
      .sort(sortByLatest);
  }, [conversationsQuery.data, search]);

  const buckets = useMemo(() => {
    const next: Record<BoardBucketId, ConversationListItem[]> = {
      new: [],
      solved: [],
      pending: [],
      rejected: [],
    };

    for (const item of visibleConversations) {
      next[classifyConversation(item)].push(item);
    }

    for (const list of Object.values(next)) {
      list.sort(sortByLatest);
    }

    return next;
  }, [visibleConversations]);

  const stats = useMemo(
    () => ({
      total: visibleConversations.length,
      newCount: buckets.new.length,
      solvedCount: buckets.solved.length,
      pendingCount: buckets.pending.length,
      rejectedCount: buckets.rejected.length,
    }),
    [buckets, visibleConversations.length],
  );

  const handleChange = (
    id: string,
    field: 'leadTemperature' | 'talkStatus' | 'courseDecision' | 'status',
    value: string,
  ) => {
    updateMutation.mutate({
      id,
      patch: { [field]: value } as Partial<
        Pick<ConversationListItem, 'leadTemperature' | 'talkStatus' | 'courseDecision' | 'status'>
      >,
    });
  };

  const handleDrop = (conversationId: string, bucketId: BoardBucketId) => {
    const patchByBucket: Record<BoardBucketId, Partial<Pick<ConversationListItem, 'leadTemperature' | 'talkStatus' | 'courseDecision' | 'status'>>> = {
      new: {
        status: 'OPEN',
        leadTemperature: 'HOT',
        talkStatus: 'NOT_TALKED',
        courseDecision: 'WILL_WRITE',
      },
      solved: {
        status: 'OPEN',
        leadTemperature: 'WARM',
        talkStatus: 'TALKED',
        courseDecision: 'WILL_WRITE',
      },
      pending: {
        status: 'OPEN',
        leadTemperature: 'COLD',
        talkStatus: 'NOT_TALKED',
        courseDecision: 'WILL_WRITE',
      },
      rejected: {
        status: 'CLOSED',
        leadTemperature: 'COLD',
        talkStatus: 'NOT_TALKED',
        courseDecision: 'WILL_NOT_WRITE',
      },
    };

    updateMutation.mutate({ id: conversationId, patch: patchByBucket[bucketId] });
    setDraggedId(null);
  };

  return (
    <div className="h-full overflow-y-auto bg-gray-50 p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="space-y-1">
          <h1 className="text-lg font-semibold">Mijozlar boshqaruvi</h1>
          <p className="text-sm text-gray-500">
            Instagram Direct orqali yozgan mijozlarni boshqaring.
          </p>
        </div>

        <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white p-4 shadow-sm md:flex-row md:items-center md:justify-between">
          <div className="flex-1">
            <label className="relative block max-w-md">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Mijozlarni qidirish..."
                className="w-full rounded-lg border border-gray-300 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
              />
            </label>
          </div>

          <div className="flex items-center gap-2 text-xs text-gray-500">
            <span className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1.5">
              Drag & drop orqali holat o'zgaradi
            </span>
          </div>
        </div>

        {conversationsQuery.isError && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {getErrorMessage(conversationsQuery.error)}
          </div>
        )}

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <MetricCard label="Jami" value={stats.total} hint="Ko'rsatilgan mijozlar" icon={<Users size={18} />} />
          <MetricCard label="Yangi" value={stats.newCount} hint="Yaqinda yozganlar" icon={<SparklesIcon />} />
          <MetricCard label="Hal bo'lgan" value={stats.solvedCount} hint="Gaplashilganlar" icon={<CheckCircle2 size={18} />} />
          <MetricCard label="Hal bo'lmagan" value={stats.pendingCount} hint="Yakunlanmaganlar" icon={<CircleDashed size={18} />} />
          <MetricCard label="Rad etgan" value={stats.rejectedCount} hint="Yopilganlar" icon={<XCircle size={18} />} />
        </section>

        <section className="overflow-x-auto pb-2">
          <div className="grid min-w-[1180px] gap-4 xl:grid-cols-4">
            {(['new', 'solved', 'pending', 'rejected'] as BoardBucketId[]).map((bucketId) => {
              const config = bucketConfig[bucketId];
              const items = buckets[bucketId];

              return (
                <article
                  key={bucketId}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (draggedId) handleDrop(draggedId, bucketId);
                  }}
                  className={`flex min-h-[620px] flex-col rounded-lg border border-gray-200 ${config.panelClass} p-4 shadow-sm`}
                >
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div>
                      <div className={`mb-2 h-1 w-12 rounded-full ${config.accentClass}`} />
                      <h2 className={`text-base font-semibold ${config.textClass}`}>{config.title}</h2>
                      <p className="mt-1 text-xs text-gray-500">{config.subtitle}</p>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${config.badgeClass}`}>
                      {items.length}
                    </span>
                  </div>

                  <div className="flex flex-1 flex-col gap-3">
                    {items.length === 0 && (
                      <div
                        className={`flex flex-1 items-center justify-center rounded-lg border border-dashed px-4 py-10 text-center text-sm ${config.emptyClass}`}
                      >
                        <MessageCircleMore size={18} className="mr-2" />
                        Bu ustunda hozircha mijoz yo'q
                      </div>
                    )}

                    {items.map((conversation) => {
                      const name = contactDisplayName(conversation.contact);
                      const bucket = classifyConversation(conversation);
                      const dragClass = draggedId === conversation.id ? 'opacity-50' : '';

                      return (
                        <article
                          key={conversation.id}
                          draggable
                          onDragStart={() => setDraggedId(conversation.id)}
                          onDragEnd={() => setDraggedId(null)}
                          className={`rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition hover:shadow-md ${dragClass}`}
                        >
                          <div className="flex items-start gap-3">
                            <Avatar src={conversation.contact.profilePictureUrl} name={name} size={44} />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-semibold text-gray-900">{name}</p>
                                  {conversation.contact.username && (
                                    <p className="truncate text-xs text-gray-500">
                                      @{conversation.contact.username}
                                    </p>
                                  )}
                                </div>

                                {conversation.unreadCount > 0 && (
                                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${bucketConfig[bucket].badgeClass}`}>
                                    {conversation.unreadCount}
                                  </span>
                                )}
                              </div>

                              <p className="mt-2 max-h-10 overflow-hidden text-sm text-gray-600">
                                {lastMessagePreview(conversation)}
                              </p>

                              <div className="mt-3 flex items-center justify-between gap-3 text-xs text-gray-400">
                                <span>{formatRelativeTime(conversation.lastMessageAt)}</span>
                                <span className="rounded-full border border-gray-200 px-2 py-0.5 text-gray-500">
                                  {conversation.status === 'OPEN' ? 'Ochiq' : 'Yopiq'}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-3">
                            <Link
                              href={`/inbox?conversation=${conversation.id}`}
                              className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:text-brand-800"
                            >
                              Chatni ochish
                              <ArrowUpRight size={14} />
                            </Link>
                            <span className="text-xs text-gray-400">{bucketConfig[bucket].subtitle}</span>
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        {conversationsQuery.isLoading && (
          <div className="flex min-h-[220px] items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-400 shadow-sm">
            <Loader2 className="mr-2 animate-spin" size={18} />
            Yuklanmoqda...
          </div>
        )}

        {!conversationsQuery.isLoading && visibleConversations.length === 0 && (
          <div className="rounded-xl border border-dashed border-gray-200 bg-white px-6 py-12 text-center text-gray-500 shadow-sm">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-lg bg-gray-100 text-gray-400">
              <MessageCircleMore size={22} />
            </div>
            <h3 className="text-base font-semibold text-gray-900">Natija topilmadi</h3>
            <p className="mt-1 text-sm text-gray-500">Qidiruvga mos mijoz topilmadi.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: number;
  hint: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-gray-500">{label}</p>
          <div className="mt-2 text-3xl font-semibold tracking-tight text-gray-900">{value}</div>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gray-100 text-gray-700">
          {icon}
        </div>
      </div>
      <p className="mt-3 text-xs text-gray-400">{hint}</p>
    </div>
  );
}

function SparklesIcon() {
  return <span className="text-lg leading-none text-gray-700">✦</span>;
}

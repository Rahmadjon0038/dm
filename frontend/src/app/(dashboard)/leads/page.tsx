'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  CircleDashed,
  Filter,
  Loader2,
  MessageCircleMore,
  Search,
  Sparkles,
  Users,
  XCircle,
} from 'lucide-react';
import Avatar from '@/components/Avatar';
import LeadStatusControls from '@/components/LeadStatusControls';
import { api, getErrorMessage } from '@/lib/api';
import { contactDisplayName, formatRelativeTime } from '@/lib/format';
import { getSocket } from '@/lib/socket';
import { ConversationListItem } from '@/lib/types';

type StatusFilter = 'all' | 'open' | 'closed';
type Timeframe = 'all' | 'week-current' | 'week-previous' | 'month-current' | 'month-previous';
type BoardBucketId = 'new' | 'solved' | 'pending' | 'rejected';

const timeframeOptions: Array<{ value: Timeframe; label: string }> = [
  { value: 'all', label: 'Barcha vaqt' },
  { value: 'week-current', label: 'Bu hafta' },
  { value: 'week-previous', label: 'O\'tgan hafta' },
  { value: 'month-current', label: 'Bu oy' },
  { value: 'month-previous', label: 'O\'tgan oy' },
];

const statusOptions: Array<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: 'Barchasi' },
  { value: 'open', label: 'Ochiq' },
  { value: 'closed', label: 'Yopiq' },
];

const bucketConfig: Record<
  BoardBucketId,
  {
    title: string;
    label: string;
    countClass: string;
    panelClass: string;
    emptyClass: string;
    accentClass: string;
    borderClass: string;
    textClass: string;
  }
> = {
  new: {
    title: 'Yangi',
    label: 'Yangi yozganlar',
    countClass: 'bg-violet-100 text-violet-700',
    panelClass: 'bg-violet-50/70',
    emptyClass: 'border-violet-200 bg-violet-50/80 text-violet-500',
    accentClass: 'from-violet-500 to-fuchsia-500',
    borderClass: 'border-violet-200/80',
    textClass: 'text-violet-600',
  },
  solved: {
    title: 'Hal bo\'lganlar',
    label: 'Gaplashilganlar',
    countClass: 'bg-emerald-100 text-emerald-700',
    panelClass: 'bg-emerald-50/70',
    emptyClass: 'border-emerald-200 bg-emerald-50/80 text-emerald-500',
    accentClass: 'from-emerald-500 to-green-500',
    borderClass: 'border-emerald-200/80',
    textClass: 'text-emerald-600',
  },
  pending: {
    title: 'Hal bo\'lmaganlar',
    label: 'Hali yakunlanmaganlar',
    countClass: 'bg-amber-100 text-amber-700',
    panelClass: 'bg-amber-50/70',
    emptyClass: 'border-amber-200 bg-amber-50/80 text-amber-500',
    accentClass: 'from-amber-500 to-orange-500',
    borderClass: 'border-amber-200/80',
    textClass: 'text-amber-600',
  },
  rejected: {
    title: 'Rad etganlar',
    label: 'Rad etilganlar',
    countClass: 'bg-rose-100 text-rose-700',
    panelClass: 'bg-rose-50/70',
    emptyClass: 'border-rose-200 bg-rose-50/80 text-rose-500',
    accentClass: 'from-rose-500 to-red-500',
    borderClass: 'border-rose-200/80',
    textClass: 'text-rose-600',
  },
};

function lastMessagePreview(item: ConversationListItem): string {
  const msg = item.lastMessage;
  if (!msg) return 'Hali xabar yo\'q';
  if (msg.text) return msg.text;
  if (msg.attachmentType === 'image') return 'Rasm';
  if (msg.attachmentType === 'video') return 'Video';
  if (msg.attachmentType === 'audio') return 'Audio';
  if (msg.attachmentType) return 'Fayl';
  return 'Xabar';
}

function startOfDay(date: Date): Date {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function startOfWeek(date: Date): Date {
  const next = startOfDay(date);
  const day = next.getDay();
  const offset = (day + 6) % 7;
  next.setDate(next.getDate() - offset);
  return next;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function getTimeframeRange(timeframe: Timeframe, now = new Date()): { start: Date; end: Date } | null {
  if (timeframe === 'all') return null;

  if (timeframe === 'week-current') {
    return { start: startOfWeek(now), end: now };
  }

  if (timeframe === 'week-previous') {
    const end = startOfWeek(now);
    const start = new Date(end);
    start.setDate(start.getDate() - 7);
    return { start, end };
  }

  if (timeframe === 'month-current') {
    return { start: startOfMonth(now), end: now };
  }

  const end = startOfMonth(now);
  const start = new Date(end.getFullYear(), end.getMonth() - 1, 1);
  return { start, end };
}

function matchesTimeframe(item: ConversationListItem, timeframe: Timeframe): boolean {
  const range = getTimeframeRange(timeframe);
  if (!range) return true;
  if (!item.lastMessageAt) return false;
  const time = new Date(item.lastMessageAt).getTime();
  return time >= range.start.getTime() && time < range.end.getTime();
}

function classifyConversation(item: ConversationListItem): BoardBucketId {
  if (item.courseDecision === 'WILL_NOT_WRITE' || item.status === 'CLOSED') return 'rejected';
  if (item.talkStatus === 'TALKED') return 'solved';
  if (item.unreadCount > 0) return 'new';
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
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [timeframe, setTimeframe] = useState<Timeframe>('all');

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
        if (statusFilter !== 'all' && item.status !== statusFilter.toUpperCase()) return false;
        if (!matchesTimeframe(item, timeframe)) return false;
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
  }, [conversationsQuery.data, search, statusFilter, timeframe]);

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

  const stats = useMemo(() => {
    return {
      total: visibleConversations.length,
      newCount: buckets.new.length,
      solvedCount: buckets.solved.length,
      pendingCount: buckets.pending.length,
      rejectedCount: buckets.rejected.length,
    };
  }, [buckets, visibleConversations.length]);

  const timeframeLabel = timeframeOptions.find((option) => option.value === timeframe)?.label ?? 'Barcha vaqt';

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

  return (
    <div className="relative h-full overflow-y-auto bg-[radial-gradient(circle_at_top_left,_rgba(139,92,246,0.11),_transparent_34%),radial-gradient(circle_at_top_right,_rgba(16,185,129,0.08),_transparent_28%),linear-gradient(180deg,_#f8fafc_0%,_#ffffff_100%)] p-4 sm:p-6">
      <div className="pointer-events-none absolute left-[-6rem] top-20 h-56 w-56 rounded-full bg-violet-200/30 blur-3xl" />
      <div className="pointer-events-none absolute right-[-5rem] top-10 h-60 w-60 rounded-full bg-emerald-200/25 blur-3xl" />

      <div className="relative mx-auto flex max-w-[1600px] flex-col gap-6">
        <section className="rounded-[32px] border border-white/70 bg-white/90 p-5 shadow-[0_20px_60px_rgba(15,23,42,0.08)] backdrop-blur-xl sm:p-6">
          <div className="flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-2xl">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs font-semibold text-violet-700">
                <Sparkles size={14} />
                Lidlar boshqaruvi
              </div>
              <h1 className="text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
                Mijozlar boshqaruvi
              </h1>
              <p className="mt-2 text-sm leading-6 text-slate-500 sm:text-[15px]">
                Instagram Direct orqali yozgan mijozlarni boshqaring. Vaqt bo'yicha hafta va oy
                filtrlari bilan o'tgan va hozirgi yozishmalarni tez ajrating.
              </p>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <label className="relative flex w-full min-w-[280px] items-center">
                <Search className="pointer-events-none absolute left-4 text-slate-400" size={18} />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Mijozlarni qidirish..."
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-white pl-11 pr-4 text-sm text-slate-700 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-violet-300 focus:ring-4 focus:ring-violet-100"
                />
              </label>

              <label className="relative flex min-w-[170px] items-center">
                <Filter className="pointer-events-none absolute left-4 text-slate-400" size={18} />
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
                  className="h-12 w-full appearance-none rounded-2xl border border-slate-200 bg-white pl-11 pr-11 text-sm font-medium text-slate-700 shadow-sm outline-none transition focus:border-violet-300 focus:ring-4 focus:ring-violet-100"
                >
                  {statusOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-4 text-slate-400" size={16} />
              </label>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2 overflow-x-auto pb-1">
            {timeframeOptions.map((option) => {
              const active = option.value === timeframe;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setTimeframe(option.value)}
                  className={`rounded-full border px-4 py-2 text-sm font-medium transition ${
                    active
                      ? 'border-violet-200 bg-violet-600 text-white shadow-[0_10px_25px_rgba(124,58,237,0.22)]'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-violet-200 hover:bg-violet-50 hover:text-violet-700'
                  }`}
                >
                  {option.label}
                </button>
              );
            })}

            <div className="ml-auto hidden items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-500 lg:flex">
              <CalendarDays size={14} />
              Faol filter: {timeframeLabel}
            </div>
          </div>
        </section>

        {conversationsQuery.isError && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {getErrorMessage(conversationsQuery.error)}
          </div>
        )}

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <MetricCard
            label="Jami"
            value={stats.total}
            hint="Ko'rsatilgan mijozlar"
            icon={<Users size={18} />}
            tone="bg-slate-100 text-slate-700"
          />
          <MetricCard
            label="Yangi"
            value={stats.newCount}
            hint="Yaqinda yozganlar"
            icon={<Sparkles size={18} />}
            tone="bg-violet-100 text-violet-700"
          />
          <MetricCard
            label="Hal bo'lgan"
            value={stats.solvedCount}
            hint="Gaplashilganlar"
            icon={<CheckCircle2 size={18} />}
            tone="bg-emerald-100 text-emerald-700"
          />
          <MetricCard
            label="Hal bo'lmagan"
            value={stats.pendingCount}
            hint="Yakunlanmaganlar"
            icon={<CircleDashed size={18} />}
            tone="bg-amber-100 text-amber-700"
          />
          <MetricCard
            label="Rad etgan"
            value={stats.rejectedCount}
            hint="Yopilganlar"
            icon={<XCircle size={18} />}
            tone="bg-rose-100 text-rose-700"
          />
        </section>

        <section className="overflow-x-auto pb-2">
          <div className="grid min-w-[1180px] gap-4 xl:grid-cols-4">
            {(['new', 'solved', 'pending', 'rejected'] as BoardBucketId[]).map((bucketId) => {
              const config = bucketConfig[bucketId];
              const items = buckets[bucketId];

              return (
                <article
                  key={bucketId}
                  className={`flex min-h-[650px] flex-col rounded-[28px] border ${config.borderClass} ${config.panelClass} p-4 shadow-[0_12px_36px_rgba(15,23,42,0.06)]`}
                >
                  <div className="mb-4 flex items-start justify-between gap-3">
                    <div>
                      <div className={`mb-2 h-1 w-14 rounded-full bg-gradient-to-r ${config.accentClass}`} />
                      <h2 className={`text-lg font-semibold ${config.textClass}`}>{config.title}</h2>
                      <p className="mt-1 text-xs text-slate-500">{config.label}</p>
                    </div>
                    <span className={`rounded-full px-3 py-1 text-sm font-semibold ${config.countClass}`}>
                      {items.length}
                    </span>
                  </div>

                  <div className="flex flex-1 flex-col gap-3">
                    {items.length === 0 && (
                      <div
                        className={`flex flex-1 flex-col items-center justify-center rounded-3xl border border-dashed px-4 py-10 text-center text-sm ${config.emptyClass}`}
                      >
                        <MessageCircleMore size={18} className="mb-2" />
                        Bu ustunda hozircha mijoz yo'q
                      </div>
                    )}

                    {items.map((conversation) => {
                      const name = contactDisplayName(conversation.contact);
                      const bucket = classifyConversation(conversation);
                      const chipClass = bucketConfig[bucket].countClass;
                      const linkTone =
                        bucket === 'new'
                          ? 'text-violet-600 hover:text-violet-700'
                          : bucket === 'solved'
                            ? 'text-emerald-600 hover:text-emerald-700'
                            : bucket === 'pending'
                              ? 'text-amber-600 hover:text-amber-700'
                              : 'text-rose-600 hover:text-rose-700';

                      return (
                        <article
                          key={conversation.id}
                          className="rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:shadow-xl"
                        >
                          <div className="flex items-start gap-3">
                            <Avatar src={conversation.contact.profilePictureUrl} name={name} size={46} />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-semibold text-slate-900">{name}</p>
                                  {conversation.contact.username && (
                                    <p className="truncate text-xs text-slate-500">
                                      @{conversation.contact.username}
                                    </p>
                                  )}
                                </div>

                                {conversation.unreadCount > 0 && (
                                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${chipClass}`}>
                                    {conversation.unreadCount}
                                  </span>
                                )}
                              </div>

                              <p className="mt-2 max-h-12 overflow-hidden text-sm leading-6 text-slate-600">
                                {lastMessagePreview(conversation)}
                              </p>

                              <div className="mt-3 flex items-center justify-between gap-3 text-xs text-slate-400">
                                <span>{formatRelativeTime(conversation.lastMessageAt)}</span>
                                <span className="rounded-full border border-slate-200 px-2.5 py-1 font-medium text-slate-500">
                                  {conversation.status === 'OPEN' ? 'Ochiq' : 'Yopiq'}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                            <Link
                              href={`/inbox?conversation=${conversation.id}`}
                              className={`inline-flex items-center gap-1.5 text-sm font-medium ${linkTone}`}
                            >
                              Chatni ochish
                              <ArrowUpRight size={15} />
                            </Link>
                            <span className="text-xs text-slate-400">{bucketConfig[bucket].label}</span>
                          </div>

                          <details className="mt-3 rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-3 py-2">
                            <summary className="cursor-pointer list-none text-xs font-medium text-slate-500">
                              Holatni o'zgartirish
                            </summary>
                            <div className="mt-3">
                              <LeadStatusControls
                                conversation={conversation}
                                compact
                                disabled={updateMutation.isPending}
                                onChange={(field, value) => handleChange(conversation.id, field, value)}
                              />
                            </div>
                          </details>
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
          <div className="flex min-h-[280px] items-center justify-center rounded-[28px] border border-slate-200 bg-white/80 text-slate-400 shadow-sm">
            <Loader2 className="mr-2 animate-spin" size={18} />
            Yuklanmoqda...
          </div>
        )}

        {!conversationsQuery.isLoading && visibleConversations.length === 0 && (
          <div className="rounded-[28px] border border-dashed border-slate-200 bg-white/75 px-6 py-14 text-center text-slate-500 shadow-sm">
            <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
              <MessageCircleMore size={24} />
            </div>
            <h3 className="text-base font-semibold text-slate-900">Natija topilmadi</h3>
            <p className="mt-1 text-sm text-slate-500">
              Qidiruv yoki vaqt filtri bo'yicha hozircha mos mijoz yo'q.
            </p>
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
  tone,
}: {
  label: string;
  value: number;
  hint: string;
  icon: ReactNode;
  tone: string;
}) {
  return (
    <div className="rounded-[24px] border border-white/70 bg-white/90 p-4 shadow-[0_12px_34px_rgba(15,23,42,0.06)] backdrop-blur">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <div className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{value}</div>
        </div>
        <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${tone}`}>{icon}</div>
      </div>
      <p className="mt-3 text-xs text-slate-400">{hint}</p>
    </div>
  );
}

'use client';

import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, KanbanSquare, Loader2, Search } from 'lucide-react';
import Avatar from '@/components/Avatar';
import LeadStatusControls from '@/components/LeadStatusControls';
import { api, getErrorMessage } from '@/lib/api';
import { contactDisplayName, formatTime } from '@/lib/format';
import { getSocket } from '@/lib/socket';
import { ConversationListItem } from '@/lib/types';

type GroupBy = 'leadTemperature' | 'talkStatus' | 'courseDecision';

const groupLabels: Record<GroupBy, string> = {
  leadTemperature: 'Temperatura',
  talkStatus: 'Gaplashish',
  courseDecision: 'Kurs',
};

const groupOptions: Record<GroupBy, { value: string; label: string }[]> = {
  leadTemperature: [
    { value: 'HOT', label: 'Issiq mijoz' },
    { value: 'WARM', label: 'Iliq mijoz' },
    { value: 'COLD', label: 'Sovuq mijoz' },
  ],
  talkStatus: [
    { value: 'TALKED', label: 'Gaplashildi' },
    { value: 'NOT_TALKED', label: 'Gaplashilmadi' },
  ],
  courseDecision: [
    { value: 'WILL_WRITE', label: 'Kursga yoziladi' },
    { value: 'WILL_NOT_WRITE', label: 'Kursga yozilmaydi' },
  ],
};

function lastMessagePreview(item: ConversationListItem): string {
  const msg = item.lastMessage;
  if (!msg) return 'Hali xabar yoq';
  if (msg.text) return msg.text;
  if (msg.attachmentType === 'image') return 'Rasm';
  if (msg.attachmentType === 'video') return 'Video';
  if (msg.attachmentType === 'audio') return 'Audio';
  if (msg.attachmentType) return 'Fayl';
  return 'Xabar';
}

function statusBadge(status: string) {
  switch (status) {
    case 'HOT':
      return 'bg-red-50 text-red-700 border-red-200';
    case 'WARM':
      return 'bg-amber-50 text-amber-700 border-amber-200';
    case 'COLD':
      return 'bg-sky-50 text-sky-700 border-sky-200';
    case 'TALKED':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    case 'NOT_TALKED':
      return 'bg-gray-100 text-gray-600 border-gray-200';
    case 'WILL_WRITE':
      return 'bg-violet-50 text-violet-700 border-violet-200';
    case 'WILL_NOT_WRITE':
      return 'bg-stone-100 text-stone-600 border-stone-200';
    default:
      return 'bg-gray-100 text-gray-600 border-gray-200';
  }
}

function statusLabel(field: GroupBy, value: string) {
  return groupOptions[field].find((option) => option.value === value)?.label ?? value;
}

export default function LeadsPage() {
  const queryClient = useQueryClient();
  const [groupBy, setGroupBy] = useState<GroupBy>('leadTemperature');
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

  const visibleConversations = useMemo(() => {
    const items = conversationsQuery.data ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return items;

    return items.filter((item) => {
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
    });
  }, [conversationsQuery.data, search]);

  const stats = useMemo(() => {
    const total = visibleConversations.length;
    const hot = visibleConversations.filter((item) => item.leadTemperature === 'HOT').length;
    const warm = visibleConversations.filter((item) => item.leadTemperature === 'WARM').length;
    const cold = visibleConversations.filter((item) => item.leadTemperature === 'COLD').length;
    const talked = visibleConversations.filter((item) => item.talkStatus === 'TALKED').length;
    const notTalked = visibleConversations.filter((item) => item.talkStatus === 'NOT_TALKED').length;
    const willWrite = visibleConversations.filter((item) => item.courseDecision === 'WILL_WRITE').length;
    const willNotWrite = visibleConversations.filter((item) => item.courseDecision === 'WILL_NOT_WRITE').length;
    return { total, hot, warm, cold, talked, notTalked, willWrite, willNotWrite };
  }, [visibleConversations]);

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
    onError: (_err, _vars, context) => {
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

  const grouped = useMemo<
    Array<{ value: string; label: string; items: ConversationListItem[] }>
  >(() => {
    const items = visibleConversations;
    const buckets = new Map<string, ConversationListItem[]>();
    for (const option of groupOptions[groupBy]) {
      buckets.set(option.value, []);
    }
    for (const item of items) {
      const key = item[groupBy] as string;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push(item);
    }
    buckets.forEach((list) => {
      list.sort((a, b) => {
        const at = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
        const bt = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
        return bt - at;
      });
    });
    return groupOptions[groupBy].map((option) => ({
      ...option,
      items: buckets.get(option.value) ?? [],
    }));
  }, [groupBy, visibleConversations]);

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

  const handleDrop = (conversationId: string, value: string) => {
    handleChange(conversationId, groupBy, value);
    setDraggedId(null);
  };

  return (
    <div className="h-full overflow-y-auto bg-gradient-to-br from-slate-50 via-white to-amber-50/30 p-6">
      <div className="mx-auto max-w-[1600px] space-y-6">
        <div className="rounded-3xl border border-slate-200 bg-white/90 p-5 shadow-sm backdrop-blur">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="mb-2 flex items-center gap-2 text-sm font-medium text-brand-700">
                <KanbanSquare size={16} />
                Lidlar boardi
              </div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
                Mijozlarni statuslar bo'yicha ajrating
              </h1>
              <p className="mt-1 max-w-2xl text-sm text-slate-500">
                Qidiruv, tezkor statistika va drag-and-drop bilan mijozlarni boshqaring.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
                <Search size={15} />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Qidirish..."
                  className="w-52 bg-transparent text-sm outline-none placeholder:text-slate-400"
                />
              </label>

              <label className="text-sm font-medium text-slate-600">
                Guruhlash
                <select
                  value={groupBy}
                  onChange={(e) => setGroupBy(e.target.value as GroupBy)}
                  className="ml-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
                >
                  <option value="leadTemperature">Temperatura</option>
                  <option value="talkStatus">Gaplashish</option>
                  <option value="courseDecision">Kurs</option>
                </select>
              </label>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Jami" value={stats.total} hint="Ko'rsatilgan mijozlar" />
            <StatCard label="Issiq" value={stats.hot} hint={`${stats.warm} iliq / ${stats.cold} sovuq`} />
            <StatCard label="Gaplashildi" value={stats.talked} hint={`${stats.notTalked} gaplashilmadi`} />
            <StatCard label="Kursga yoziladi" value={stats.willWrite} hint={`${stats.willNotWrite} yozilmaydi`} />
          </div>
        </div>

        {conversationsQuery.isError && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {getErrorMessage(conversationsQuery.error)}
          </div>
        )}

        <div className="overflow-x-auto pb-4">
          <div
            className="grid min-w-[980px] gap-4"
            style={{ gridTemplateColumns: `repeat(${grouped.length}, minmax(0, 1fr))` }}
          >
            {conversationsQuery.isLoading ? (
              <div className="col-span-full flex min-h-[320px] items-center justify-center text-slate-400">
                <Loader2 className="mr-2 animate-spin" size={18} />
                Yuklanmoqda...
              </div>
            ) : (
              grouped.map((column) => (
                <section
                  key={column.value}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (draggedId) handleDrop(draggedId, column.value);
                  }}
                  className="flex min-h-[520px] flex-col rounded-3xl border border-slate-200 bg-white/80 p-4 shadow-sm"
                >
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                      <h2 className="text-sm font-semibold text-slate-900">
                        {statusLabel(groupBy, column.value)}
                      </h2>
                      <p className="text-xs text-slate-500">
                        {groupLabels[groupBy]} bo'yicha {column.items.length} ta mijoz
                      </p>
                    </div>
                    <span className={`rounded-full border px-2.5 py-1 text-xs font-medium ${statusBadge(column.value)}`}>
                      {column.items.length}
                    </span>
                  </div>

                  <div className="flex flex-1 flex-col gap-3">
                    {column.items.length === 0 && (
                      <div className="flex flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-400">
                        <AlertCircle size={18} className="mb-2" />
                        Bu ustunda hozircha mijoz yoq
                      </div>
                    )}

                    {column.items.map((conversation) => {
                      const name = contactDisplayName(conversation.contact);
                      return (
                        <article
                          key={conversation.id}
                          draggable
                          onDragStart={() => setDraggedId(conversation.id)}
                          onDragEnd={() => setDraggedId(null)}
                          className={`rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md ${
                            draggedId === conversation.id ? 'opacity-50' : ''
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <Avatar src={conversation.contact.profilePictureUrl} name={name} size={44} />
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
                                  <span className="shrink-0 rounded-full bg-brand-600 px-2.5 py-1 text-xs font-medium text-white">
                                    {conversation.unreadCount}
                                  </span>
                                )}
                              </div>
                              <p className="mt-2 max-h-10 overflow-hidden text-sm text-slate-600">
                                {lastMessagePreview(conversation)}
                              </p>
                              <div className="mt-2 flex items-center justify-between gap-2 text-xs text-slate-400">
                                <span>{formatTime(conversation.lastMessageAt)}</span>
                                <span className="rounded-full border border-slate-200 px-2 py-0.5">
                                  {conversation.status === 'OPEN' ? 'Ochiq' : 'Yopiq'}
                                </span>
                              </div>
                            </div>
                          </div>

                          <div className="mt-4">
                            <LeadStatusControls
                              conversation={conversation}
                              compact
                              disabled={updateMutation.isPending}
                              onChange={(field, value) => handleChange(conversation.id, field, value)}
                            />
                          </div>
                        </article>
                      );
                    })}
                  </div>
                </section>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  hint,
}: {
  label: string;
  value: number;
  hint: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <div className="mt-1 flex items-end justify-between gap-2">
        <span className="text-2xl font-semibold text-slate-900">{value}</span>
        <span className="text-xs text-slate-400">{hint}</span>
      </div>
    </div>
  );
}

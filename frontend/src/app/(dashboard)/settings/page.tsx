'use client';

import { useQuery } from '@tanstack/react-query';
import { api, API_URL } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { Admin } from '@/lib/types';

export default function SettingsPage() {
  const meQuery = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      const { data } = await api.get<{ admin: Admin }>('/auth/me');
      return data.admin;
    },
  });

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <h1 className="text-lg font-semibold">Sozlamalar</h1>
          <p className="mt-1 text-sm text-gray-500">Platforma va admin malumotlari.</p>
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-gray-700">Administrator</h2>
          {meQuery.isLoading ? (
            <p className="text-sm text-gray-400">Yuklanmoqda...</p>
          ) : (
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <dt className="text-gray-500">Email</dt>
              <dd>{meQuery.data?.email}</dd>
              <dt className="text-gray-500">Yaratilgan</dt>
              <dd>{meQuery.data?.createdAt ? formatDateTime(meQuery.data.createdAt) : '—'}</dd>
            </dl>
          )}
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-gray-700">Tizim</h2>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <dt className="text-gray-500">Backend API</dt>
            <dd className="font-mono text-xs">{API_URL}</dd>
            <dt className="text-gray-500">Webhook URL</dt>
            <dd className="font-mono text-xs">{API_URL}/api/webhooks/instagram</dd>
          </dl>
        </div>
      </div>
    </div>
  );
}

'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useState } from 'react';
import Avatar from '@/components/Avatar';
import { api, getErrorMessage } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { InstagramAccount } from '@/lib/types';

export default function InstagramPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    instagramAccountId: '',
    username: '',
    accessToken: '',
    verifyToken: '',
  });

  const accountQuery = useQuery({
    queryKey: ['instagram-account'],
    queryFn: async () => {
      const { data } = await api.get<{ account: InstagramAccount | null }>('/instagram/account');
      return data.account;
    },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['instagram-account'] });

  const connectMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post('/instagram/connect', {
        instagramAccountId: form.instagramAccountId || undefined,
        username: form.username || undefined,
        accessToken: form.accessToken,
        verifyToken: form.verifyToken,
      });
      return data;
    },
    onSuccess: () => {
      // Token faqat yuborish paytida xotirada boladi, formadan darhol tozalanadi.
      setForm({ instagramAccountId: '', username: '', accessToken: '', verifyToken: '' });
      invalidate();
    },
  });

  const testMutation = useMutation({
    mutationFn: async () => (await api.post('/instagram/test-connection')).data,
    onSuccess: invalidate,
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => (await api.post('/instagram/disconnect')).data,
    onSuccess: invalidate,
  });

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    connectMutation.mutate();
  };

  const account = accountQuery.data;
  const inputClass =
    'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100';

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <h1 className="text-lg font-semibold">Instagram akkaunt</h1>
          <p className="mt-1 text-sm text-gray-500">
            Professional (Business) akkauntni ulang va DM xabarlarini shu platformada boshqaring.
          </p>
        </div>

        {/* Akkaunt holati */}
        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-gray-700">Akkaunt holati</h2>

          {accountQuery.isLoading && <p className="text-sm text-gray-400">Yuklanmoqda...</p>}

          {!accountQuery.isLoading && !account && (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <span className="h-2.5 w-2.5 rounded-full bg-gray-300" />
              Akkaunt hali ulanmagan
            </div>
          )}

          {account && (
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <Avatar
                  src={account.profilePictureUrl}
                  name={account.name || account.username}
                  size={56}
                />
                <div>
                  <p className="font-medium">@{account.username}</p>
                  {account.name && <p className="text-sm text-gray-500">{account.name}</p>}
                </div>
                <span
                  className={`ml-auto flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
                    account.isConnected
                      ? 'bg-green-50 text-green-700'
                      : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  <span
                    className={`h-2 w-2 rounded-full ${
                      account.isConnected ? 'bg-green-500' : 'bg-gray-400'
                    }`}
                  />
                  {account.isConnected ? 'Ulangan' : 'Uzilgan'}
                </span>
              </div>

              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                <dt className="text-gray-500">Account ID</dt>
                <dd className="font-mono text-xs">{account.instagramAccountId}</dd>
                <dt className="text-gray-500">Akkaunt turi</dt>
                <dd>{account.accountType || '—'}</dd>
                <dt className="text-gray-500">Token</dt>
                <dd>{account.hasToken ? 'Saqlangan (shifrlangan)' : 'Mavjud emas'}</dd>
                <dt className="text-gray-500">Token muddati</dt>
                <dd>
                  {account.tokenExpiresAt ? `~${formatDateTime(account.tokenExpiresAt)}` : '—'}
                </dd>
              </dl>

              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => testMutation.mutate()}
                  disabled={testMutation.isPending || !account.hasToken}
                  className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium transition hover:bg-gray-50 disabled:opacity-50"
                >
                  {testMutation.isPending ? 'Tekshirilmoqda...' : 'Ulanishni tekshirish'}
                </button>
                {account.isConnected && (
                  <button
                    onClick={() => disconnectMutation.mutate()}
                    disabled={disconnectMutation.isPending}
                    className="rounded-lg border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 transition hover:bg-red-50 disabled:opacity-50"
                  >
                    Uzish
                  </button>
                )}
              </div>

              {testMutation.isSuccess && (
                <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
                  Ulanish ishlayapti ✓
                </p>
              )}
              {testMutation.isError && (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
                  {getErrorMessage(testMutation.error)}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Ulash formasi */}
        <form
          onSubmit={handleSubmit}
          className="space-y-4 rounded-xl border border-gray-200 bg-white p-5 shadow-sm"
        >
          <div>
            <h2 className="text-sm font-semibold text-gray-700">Akkauntni ulash</h2>
            <p className="mt-1 text-xs text-gray-500">
              Test bosqichida access token Meta Dashboard orqali qolda olinadi. Token backendda
              shifrlangan holda saqlanadi va brauzerga qaytarilmaydi.
            </p>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Instagram Account ID</label>
            <input
              type="text"
              value={form.instagramAccountId}
              onChange={(e) => setForm({ ...form, instagramAccountId: e.target.value })}
              className={inputClass}
              placeholder="1784xxxxxxxxxxxxx (ixtiyoriy — API orqali aniqlanadi)"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">Instagram Username</label>
            <input
              type="text"
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              className={inputClass}
              placeholder="username (ixtiyoriy)"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">
              Access Token <span className="text-red-500">*</span>
            </label>
            <input
              type="password"
              required
              value={form.accessToken}
              onChange={(e) => setForm({ ...form, accessToken: e.target.value })}
              className={inputClass}
              placeholder="IGAAR..."
              autoComplete="off"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">
              Verify Token <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              required
              value={form.verifyToken}
              onChange={(e) => setForm({ ...form, verifyToken: e.target.value })}
              className={inputClass}
              placeholder="Meta Dashboardda kiritiladigan webhook verify token"
            />
          </div>

          {connectMutation.isError && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
              {getErrorMessage(connectMutation.error)}
            </p>
          )}
          {connectMutation.isSuccess && (
            <p className="rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
              Akkaunt muvaffaqiyatli ulandi ✓
            </p>
          )}

          <button
            type="submit"
            disabled={connectMutation.isPending}
            className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-700 disabled:opacity-60"
          >
            {connectMutation.isPending ? 'Tekshirilmoqda...' : 'Tekshirish va ulash'}
          </button>
        </form>
      </div>
    </div>
  );
}

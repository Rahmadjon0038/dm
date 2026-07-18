'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Camera, Inbox, KanbanSquare, LogOut, MessageCircleHeart, Settings } from 'lucide-react';
import { clearToken, getToken } from '@/lib/api';
import { disconnectSocket } from '@/lib/socket';

const navItems = [
  { href: '/leads', label: 'Lidlar', Icon: KanbanSquare },
  { href: '/inbox', label: 'Inbox', Icon: Inbox },
  { href: '/instagram', label: 'Instagram akkaunt', Icon: Camera },
  { href: '/settings', label: 'Sozlamalar', Icon: Settings },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!getToken()) {
      router.replace('/login');
    } else {
      setReady(true);
    }
  }, [router]);

  const handleLogout = () => {
    disconnectSocket();
    clearToken();
    router.replace('/login');
  };

  if (!ready) return null;

  return (
    <div className="flex h-screen overflow-hidden">
      <aside className="flex w-60 shrink-0 flex-col border-r border-gray-200 bg-white">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 via-fuchsia-500 to-orange-400 text-white shadow-sm">
            <MessageCircleHeart size={19} strokeWidth={2.2} />
          </div>
          <span className="text-sm font-semibold tracking-tight">DM Platform</span>
        </div>

        <nav className="flex-1 space-y-1 px-3">
          {navItems.map(({ href, label, Icon }) => {
            const active = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ${
                  active ? 'bg-brand-50 text-brand-700' : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <Icon size={17} strokeWidth={active ? 2.3 : 2} />
                {label}
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-gray-200 p-3">
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-gray-600 transition hover:bg-red-50 hover:text-red-600"
          >
            <LogOut size={17} strokeWidth={2} />
            Chiqish
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-hidden">{children}</main>
    </div>
  );
}

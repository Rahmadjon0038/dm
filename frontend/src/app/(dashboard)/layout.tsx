'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import {
  Camera,
  ChevronLeft,
  ChevronRight,
  Inbox,
  KanbanSquare,
  LogOut,
  MessageCircleHeart,
  Settings,
} from 'lucide-react';
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
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const saved = window.localStorage.getItem('sidebar-collapsed');
    setCollapsed(saved === '1');
  }, []);

  useEffect(() => {
    window.localStorage.setItem('sidebar-collapsed', collapsed ? '1' : '0');
  }, [collapsed]);

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
      <aside
        className={`flex shrink-0 flex-col border-r border-gray-200 bg-white transition-[width] duration-200 ${
          collapsed ? 'w-16' : 'w-60'
        }`}
      >
        <div className={`flex items-center ${collapsed ? 'justify-center px-2 py-4' : 'justify-between px-5 py-5'}`}>
          <div className={`flex items-center gap-2.5 ${collapsed ? 'justify-center' : ''}`}>
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gray-900 text-white shadow-sm">
              <MessageCircleHeart size={19} strokeWidth={2.2} />
            </div>
            {!collapsed && <span className="text-sm font-semibold tracking-tight">DM Platform</span>}
          </div>

          <button
            type="button"
            onClick={() => setCollapsed((current) => !current)}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-gray-500 transition hover:bg-gray-100 hover:text-gray-900"
            aria-label={collapsed ? 'Sidebarni kengaytirish' : 'Sidebarni yigish'}
            title={collapsed ? 'Sidebarni kengaytirish' : 'Sidebarni yigish'}
          >
            {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
        </div>

        <nav className={`flex-1 space-y-1 ${collapsed ? 'px-2' : 'px-3'}`}>
          {navItems.map(({ href, label, Icon }) => {
            const active = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                title={collapsed ? label : undefined}
                className={`flex items-center rounded-lg py-2 text-sm font-medium transition ${
                  collapsed ? 'justify-center px-2' : 'gap-3 px-3'
                } ${active ? 'bg-brand-50 text-brand-700' : 'text-gray-600 hover:bg-gray-100'}`}
              >
                <Icon size={17} strokeWidth={active ? 2.3 : 2} />
                {!collapsed && label}
              </Link>
            );
          })}
        </nav>

        <div className={`border-t border-gray-200 ${collapsed ? 'p-2' : 'p-3'}`}>
          <button
            onClick={handleLogout}
            title={collapsed ? 'Chiqish' : undefined}
            className={`flex w-full items-center rounded-lg py-2 text-sm font-medium text-gray-600 transition hover:bg-red-50 hover:text-red-600 ${
              collapsed ? 'justify-center px-2' : 'gap-3 px-3'
            }`}
          >
            <LogOut size={17} strokeWidth={2} />
            {!collapsed && 'Chiqish'}
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-hidden">{children}</main>
    </div>
  );
}

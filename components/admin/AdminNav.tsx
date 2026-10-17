'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { Bell } from 'lucide-react';
import { NativeSelect } from '@/components/ui/native-select';
import { cn } from '@/lib/utils';
import { FOCUS } from './adminStyles';

const ITEMS = [
  { href: '/admin/curriculum', label: 'Curriculum' },
  { href: '/admin/curriculum/flashcard-violations', label: 'Flashcard violations' },
  { href: '/admin/placement-exam', label: 'Placement exam' },
  { href: '/admin/practice-review', label: 'Practice review' },
  { href: '/admin/exam-practice', label: 'Exam practice' },
  { href: '/admin/notifications', label: 'Notifications' },
  { href: '/admin/settings', label: 'Settings' },
];

const NOTIFICATIONS = '/admin/notifications';

// Sent by the notifications page after Mark all read, so the bell updates without a reload.
export const NOTIFICATIONS_CHANGED = 'admin-notifications-changed';

// The unread count for the bell, refreshed on every navigation and after Mark all read.
function useUnread(enabled: boolean, pathname: string): number {
  const [unread, setUnread] = useState(0);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const bump = () => setTick((n) => n + 1);
    window.addEventListener(NOTIFICATIONS_CHANGED, bump);
    return () => window.removeEventListener(NOTIFICATIONS_CHANGED, bump);
  }, []);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    fetch('/api/admin/notifications/count')
      .then(async (res) => {
        if (!res.ok) return;
        const data = (await res.json()) as { unread?: unknown };
        if (!cancelled && typeof data.unread === 'number') setUnread(data.unread);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [enabled, pathname, tick]);
  return unread;
}

// The most specific item whose href prefixes the path wins, so Flashcard violations does not also light up Curriculum.
function activeHref(pathname: string): string | undefined {
  return ITEMS.filter((i) => pathname === i.href || pathname.startsWith(`${i.href}/`)).sort(
    (a, b) => b.href.length - a.href.length,
  )[0]?.href;
}

// Admin sub-navigation: a link row from sm up, a native select on phones. Hidden on the login page.
export function AdminNav() {
  const pathname = usePathname();
  const router = useRouter();
  const onLogin = pathname.startsWith('/admin/login');
  const unread = useUnread(!onLogin, pathname);
  if (onLogin) return null;
  const active = activeHref(pathname);
  return (
    <nav aria-label="Admin" className="mb-6">
      <div className="sm:hidden">
        <NativeSelect aria-label="Admin section" value={active ?? ''} onChange={(e) => router.push(e.target.value)}>
          {active === undefined && <option value="" disabled>Admin</option>}
          {ITEMS.map((i) => (
            <option key={i.href} value={i.href}>
              {i.href === NOTIFICATIONS && unread > 0 ? `${i.label} (${unread} unread)` : i.label}
            </option>
          ))}
        </NativeSelect>
      </div>
      <ul className="hidden gap-1 border-b sm:flex">
        {ITEMS.map((i) => (
          <li key={i.href}>
            <Link
              href={i.href}
              aria-current={i.href === active ? 'page' : undefined}
              className={cn(
                '-mb-px inline-flex min-h-11 items-center border-b-2 border-transparent px-3 text-sm font-medium text-text-muted transition-colors duration-200 motion-reduce:transition-none hover:text-text',
                i.href === active && 'border-primary text-primary',
                FOCUS,
                'rounded-t-md',
              )}
            >
              {i.href === NOTIFICATIONS && <Bell aria-hidden className="mr-1.5 size-4" />}
              {i.label}
              {i.href === NOTIFICATIONS && unread > 0 && (
                <span className="ml-1.5 rounded-full bg-primary px-1.5 text-xs leading-5 font-semibold text-primary-foreground">
                  {unread}
                  <span className="sr-only"> unread</span>
                </span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

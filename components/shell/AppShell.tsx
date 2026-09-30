'use client';

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Logo } from '@/components/brand/Logo';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { navFor, type NavItem } from '@/lib/nav/navItems';
import { cn } from '@/lib/utils';
import { useShell } from './ShellContext';

const BARE_ROUTES = ['/onboarding', '/admin/login'];

function useReviewsDue(): number | null {
  const [due, setDue] = useState<number | null>(null);
  useEffect(() => {
    fetch('/api/tutoring/queue/count')
      .then(async (res) => {
        if (!res.ok) return;
        const data = (await res.json()) as { due?: unknown };
        if (typeof data.due === 'number') setDue(data.due);
      })
      .catch(() => undefined);
  }, []);
  return due;
}

function NavLink({ item, due, showLabel, className }: { item: NavItem; due: number | null; showLabel: boolean; className?: string }) {
  const t = useTranslations('nav');
  const pathname = usePathname();
  const Icon = item.icon;
  const label = t(item.labelKey);
  const badge = item.badge === 'reviewsDue' && due !== null && due > 0 ? due : null;
  const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
  return (
    <Link
      href={item.href}
      aria-label={badge !== null ? t('withDue', { label, count: badge }) : label}
      aria-current={active ? 'page' : undefined}
      className={cn('relative flex items-center gap-3 rounded-lg px-3 py-2 text-text-muted transition-colors duration-200 motion-reduce:transition-none hover:bg-surface-raised hover:text-text', active && 'text-primary', className)}
    >
      <Icon aria-hidden className="size-5" />
      {showLabel && <span>{label}</span>}
      {badge !== null && (
        <span aria-hidden className="absolute -top-1 -right-1 rounded-full bg-highlight px-1.5 text-xs font-bold text-background">
          {badge}
        </span>
      )}
    </Link>
  );
}

// Spec: Shell and Navigation. Phone: top bar + floating buttons + bottom bar (thumb zone).
// Tablet: icon sidebar. Desktop: labelled sidebar. Hidden in focus mode and on bare routes.
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { focus } = useShell();
  const desktop = useMediaQuery('(min-width: 1024px)');
  const tablet = useMediaQuery('(min-width: 768px)');
  const due = useReviewsDue();
  const tNav = useTranslations('nav');

  if (focus || BARE_ROUTES.some((route) => pathname.startsWith(route))) return <>{children}</>;

  if (desktop || tablet) {
    return (
      <div className="flex min-h-dvh">
        <nav aria-label={tNav('main')} className={cn('sticky top-0 flex h-dvh flex-col gap-1 border-r border-border bg-surface p-3', desktop ? 'w-60' : 'w-16')}>
          <Link href="/" aria-label="NaDoch!" className="mb-4 block">
            <Logo variant="compact" className={desktop ? 'h-12' : 'h-8'} title="NaDoch!" />
          </Link>
          {navFor('sidebar')
            .filter((item) => item.id !== 'profile' && item.id !== 'settings')
            .map((item) => (
              <NavLink key={item.id} item={item} due={due} showLabel={desktop} />
            ))}
          <div className="mt-auto flex flex-col gap-1">
            {navFor('sidebar')
              .filter((item) => item.id === 'profile' || item.id === 'settings')
              .map((item) => (
                <NavLink key={item.id} item={item} due={due} showLabel={desktop} />
              ))}
          </div>
        </nav>
        <main className="flex-1 px-6 py-6">{children}</main>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background/90 px-4 py-2 backdrop-blur">
        <Link href="/" aria-label="NaDoch!">
          <Logo variant="compact" className="h-9" title="NaDoch!" />
        </Link>
        {navFor('top').map((item) => (
          <NavLink key={item.id} item={item} due={due} showLabel={false} />
        ))}
      </header>
      <main className="flex-1 px-4 pt-4 pb-32">{children}</main>
      <div className="fixed right-4 bottom-20 z-10 flex gap-3">
        {navFor('fab').map((item) => (
          <NavLink key={item.id} item={item} due={due} showLabel={false} className="size-14 justify-center rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary hover:text-primary-foreground" />
        ))}
      </div>
      <nav aria-label={tNav('main')} className="fixed inset-x-0 bottom-0 z-10 flex justify-between border-t border-border bg-surface px-6 py-2">
        {navFor('bottom').map((item) => (
          <NavLink key={item.id} item={item} due={due} showLabel className="flex-col gap-0.5 text-xs" />
        ))}
      </nav>
    </div>
  );
}

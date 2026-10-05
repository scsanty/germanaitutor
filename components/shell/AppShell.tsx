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

// Refetched on every navigation so the badge follows the student's progress; skipped where the shell is hidden.
function useReviewsDue(pathname: string, active: boolean): number | null {
  const [due, setDue] = useState<number | null>(null);
  useEffect(() => {
    if (!active) return;
    let stale = false;
    fetch('/api/tutoring/queue/count')
      .then(async (res) => {
        const data = res.ok ? ((await res.json()) as { due?: unknown }) : {};
        if (!stale) setDue(typeof data.due === 'number' ? data.due : null);
      })
      .catch(() => {
        if (!stale) setDue(null);
      });
    return () => {
      stale = true;
    };
  }, [pathname, active]);
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
  const hidden = focus || BARE_ROUTES.some((route) => pathname.startsWith(route));
  const due = useReviewsDue(pathname, !hidden);
  const tNav = useTranslations('nav');

  const wide = desktop || tablet;
  const phone = !hidden && !wide;

  // Final review C1: {children} sits at one fixed position (<main>, third child) in every mode.
  // Chrome comes and goes as siblings at fixed indices, so entering or leaving focus mode,
  // or resizing across a breakpoint, never remounts the page and loses its state.
  return (
    <div className={cn('flex min-h-dvh', !wide && 'flex-col')}>
      {!hidden && wide && (
        <nav aria-label={tNav('main')} className={cn('sticky top-0 flex h-dvh flex-col gap-1 border-r border-border bg-surface p-3', desktop ? 'w-60' : 'w-16')}>
          {/* Full sidebar width (desktop w-60, tablet rail w-16): the -mx-3 cancels the nav padding. */}
          <Link href="/" aria-label="NaDoch!" className="-mx-3 mb-2 block">
            <Logo className="w-full" title="NaDoch!" />
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
      )}
      {phone && (
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-background/90 px-4 py-2 backdrop-blur">
          <Link href="/" aria-label="NaDoch!">
            {/* 7.5rem wide is 4rem tall at the logo's 860:460 ratio. */}
            <Logo className="w-[7.5rem]" title="NaDoch!" />
          </Link>
          {navFor('top').map((item) => (
            <NavLink key={item.id} item={item} due={due} showLabel={false} />
          ))}
        </header>
      )}
      <main className={cn('flex-1', !hidden && (wide ? 'px-6 py-6' : 'px-4 pt-4 pb-32'))}>{children}</main>
      {phone && (
        <div className="fixed right-4 bottom-20 z-10 flex gap-3">
          {navFor('fab').map((item) => (
            <NavLink key={item.id} item={item} due={due} showLabel={false} className="size-14 justify-center rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary hover:text-primary-foreground" />
          ))}
        </div>
      )}
      {phone && (
        <nav aria-label={tNav('main')} className="fixed inset-x-0 bottom-0 z-10 flex justify-between border-t border-border bg-surface px-6 py-2">
          {navFor('bottom').map((item) => (
            <NavLink key={item.id} item={item} due={due} showLabel className="flex-col gap-0.5 text-xs" />
          ))}
        </nav>
      )}
    </div>
  );
}

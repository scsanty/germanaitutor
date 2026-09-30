'use client';

import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { NativeSelect } from '@/components/ui/native-select';
import { cn } from '@/lib/utils';
import { FOCUS } from './adminStyles';

const ITEMS = [
  { href: '/admin/curriculum', label: 'Curriculum' },
  { href: '/admin/curriculum/flashcard-violations', label: 'Flashcard violations' },
  { href: '/admin/placement-exam', label: 'Placement exam' },
  { href: '/admin/practice-review', label: 'Practice review' },
];

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
  if (pathname.startsWith('/admin/login')) return null;
  const active = activeHref(pathname);
  return (
    <nav aria-label="Admin" className="mb-6">
      <div className="sm:hidden">
        <NativeSelect aria-label="Admin section" value={active ?? ''} onChange={(e) => router.push(e.target.value)}>
          {active === undefined && <option value="" disabled>Admin</option>}
          {ITEMS.map((i) => (
            <option key={i.href} value={i.href}>
              {i.label}
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
              {i.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

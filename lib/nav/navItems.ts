import { BookOpenCheck, Gauge, Layers, Repeat, Settings, Snowflake, TreeDeciduous, User, type LucideIcon } from 'lucide-react';

export type NavPlacement = 'sidebar' | 'fab' | 'bottom' | 'top';

export interface NavItem {
  id: 'learn' | 'dashboard' | 'review' | 'flashcards' | 'freestyle' | 'profile' | 'settings';
  href: string;
  icon: LucideIcon;
  labelKey: string;
  placements: NavPlacement[];
  // Spec: items for unbuilt features stay hidden. Each module's plan flips its own flag.
  enabled: boolean;
  badge?: 'reviewsDue';
}

// Order within a placement is the order shown. Spec: Shell and Navigation (thumb zone).
export const NAV_ITEMS: NavItem[] = [
  { id: 'learn', href: '/', icon: TreeDeciduous, labelKey: 'learn', placements: ['sidebar'], enabled: true },
  { id: 'dashboard', href: '/dashboard', icon: Gauge, labelKey: 'dashboard', placements: ['sidebar', 'bottom'], enabled: true },
  { id: 'freestyle', href: '/freestyle', icon: Snowflake, labelKey: 'freestyle', placements: ['sidebar', 'fab'], enabled: false },
  { id: 'flashcards', href: '/flashcards', icon: Layers, labelKey: 'flashcards', placements: ['sidebar', 'fab'], enabled: false },
  { id: 'review', href: '/queue', icon: Repeat, labelKey: 'review', placements: ['sidebar', 'fab'], enabled: true, badge: 'reviewsDue' },
  { id: 'profile', href: '/profile', icon: User, labelKey: 'profile', placements: ['sidebar', 'bottom'], enabled: true },
  { id: 'settings', href: '/settings', icon: Settings, labelKey: 'settings', placements: ['sidebar', 'top'], enabled: true },
];

export function navFor(placement: NavPlacement): NavItem[] {
  return NAV_ITEMS.filter((item) => item.enabled && item.placements.includes(placement));
}

export { BookOpenCheck };

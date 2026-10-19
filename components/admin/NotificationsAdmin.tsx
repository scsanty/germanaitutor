'use client';

import { useEffect, useRef, useState } from 'react';
import type { AdminNotification } from '@/lib/services/notificationService';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { BTN, HINT } from './adminStyles';
import { NOTIFICATIONS_CHANGED } from './AdminNav';

type Filter = 'all' | 'open' | 'unread';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'open', label: 'Open problems' },
  { id: 'unread', label: 'Unread' },
];

const when = (iso: string) => iso.slice(0, 16).replace('T', ' ');

// Admin-only, English. Spec: problems and information for the admin, newest first, with any email
// that could not be sent shown on its row.
export function NotificationsAdmin() {
  const [filter, setFilter] = useState<Filter>('all');
  const [items, setItems] = useState<AdminNotification[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reload, setReload] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/admin/notifications?filter=${filter}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as AdminNotification[];
        if (!cancelled) {
          setItems(data);
          setLoadFailed(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [filter, reload]);

  async function markAllRead() {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/notifications', { method: 'POST' });
      if (!res.ok) {
        setError(`Could not mark the notifications read (${res.status})`);
        return;
      }
      window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));
      setReload((n) => n + 1);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  const anyUnread = items?.some((n) => n.readAt === null) ?? false;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="Show" className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <Button
              key={f.id}
              type="button"
              variant={filter === f.id ? 'default' : 'outline'}
              aria-pressed={filter === f.id}
              className={BTN}
              onClick={() => {
                setFilter(f.id);
                setItems(null);
              }}
            >
              {f.label}
            </Button>
          ))}
        </div>
        <Button type="button" variant="outline" className={BTN} disabled={busy || !anyUnread} onClick={markAllRead}>
          Mark all read
        </Button>
      </div>

      {loadFailed && (
        <Alert variant="destructive">
          <AlertDescription>Could not load the notifications</AlertDescription>
        </Alert>
      )}
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      {!loadFailed && items === null && <p className="text-text-muted">Loading...</p>}
      {items && items.length === 0 && <p className="rounded-lg border bg-card p-4 text-text-muted">Nothing here.</p>}
      {items && items.length > 0 && (
        <ul className="flex flex-col gap-3">
          {items.map((n) => (
            <li key={n.id} aria-label={n.title} className={`min-w-0 rounded-lg border bg-card p-4 ${n.readAt === null ? 'border-primary/60' : ''}`}>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-semibold">{n.title}</h2>
                {n.severity === 'problem' ? (
                  <Badge variant={n.resolvedAt ? 'secondary' : 'destructive'}>{n.resolvedAt ? 'Resolved' : 'Open problem'}</Badge>
                ) : (
                  <Badge variant="outline">Info</Badge>
                )}
                {n.readAt === null && <Badge variant="default">Unread</Badge>}
              </div>
              <p className="mt-1 break-words whitespace-pre-wrap">{n.body}</p>
              <p className={`${HINT} mt-1`}>
                {when(n.createdAt)}
                {n.resolvedAt && ` · resolved ${when(n.resolvedAt)}`}
              </p>
              {n.emailError && <p className="mt-2 text-sm break-words text-destructive">Email not sent: {n.emailError}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

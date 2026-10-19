import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { createNotificationService } from '@/lib/services/notificationService';
import { adminError, notAdmin, unauthorized } from '../adminResponses';

export const dynamic = 'force-dynamic';

// GET ?filter=all|open|unread → AdminNotification[], newest first.
export async function GET(request: Request) {
  if (await notAdmin()) return unauthorized();
  const filter = new URL(request.url).searchParams.get('filter') ?? 'all';
  if (filter !== 'all' && filter !== 'open' && filter !== 'unread') return adminError('filter must be all, open or unread', 400);
  const list = createNotificationService(getDb()).list({ openProblems: filter === 'open', unreadOnly: filter === 'unread' });
  return NextResponse.json(list);
}

// POST → marks every notification read: { marked }.
export async function POST() {
  if (await notAdmin()) return unauthorized();
  return NextResponse.json({ marked: createNotificationService(getDb()).markAllRead() });
}

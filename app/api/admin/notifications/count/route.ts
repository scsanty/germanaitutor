import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { createNotificationService } from '@/lib/services/notificationService';
import { notAdmin, unauthorized } from '../../adminResponses';

export const dynamic = 'force-dynamic';

// GET → { unread }, for the bell in the admin sub-navigation.
export async function GET() {
  if (await notAdmin()) return unauthorized();
  return NextResponse.json({ unread: createNotificationService(getDb()).unreadCount() });
}

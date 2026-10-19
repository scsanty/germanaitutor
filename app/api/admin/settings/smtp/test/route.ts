import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { createMailService } from '@/lib/services/mailService';
import { notAdmin, unauthorized } from '../../../adminResponses';

export const dynamic = 'force-dynamic';

// POST → sends a test email with the saved settings: { ok: true }, or { ok: false, error } with the SMTP error text.
export async function POST() {
  if (await notAdmin()) return unauthorized();
  try {
    await createMailService(getDb()).send('Test email', 'This is a test email from NaDoch!. Email notifications are working.');
    return NextResponse.json({ ok: true });
  } catch (err) {
    const error = (err instanceof Error ? err.message : String(err)).slice(0, 1000);
    return NextResponse.json({ ok: false, error }, { status: 502 });
  }
}

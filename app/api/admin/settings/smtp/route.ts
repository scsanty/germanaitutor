import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { readSmtpSettingsForDisplay, saveSmtpSettings, SmtpSettingsError } from '@/lib/services/mailService';
import { adminError, notAdmin, readJsonObject, unauthorized } from '../../adminResponses';

export const dynamic = 'force-dynamic';

// GET → { settings: SmtpSettingsDisplay | null }. The password never leaves the server; only hasPassword does.
export async function GET() {
  if (await notAdmin()) return unauthorized();
  return NextResponse.json({ settings: readSmtpSettingsForDisplay(getDb()) });
}

// PUT { host, port, secure, user, password, from, to, clearPassword? } → { settings }.
// An empty or missing password keeps the stored one; clearPassword removes it.
export async function PUT(request: Request) {
  if (await notAdmin()) return unauthorized();
  const body = await readJsonObject(request);
  if (!body) return adminError('Send the SMTP settings as a JSON object', 400);
  const password = body.clearPassword === true ? '' : typeof body.password === 'string' && body.password !== '' ? body.password : null;
  try {
    const settings = saveSmtpSettings(getDb(), {
      host: body.host as string,
      port: typeof body.port === 'string' ? Number(body.port) : (body.port as number),
      secure: body.secure as boolean,
      user: (body.user ?? '') as string,
      password,
      from: body.from as string,
      to: body.to as string,
    });
    return NextResponse.json({ settings });
  } catch (err) {
    if (err instanceof SmtpSettingsError) return adminError(err.message, 400);
    throw err;
  }
}

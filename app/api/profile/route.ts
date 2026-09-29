import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { createProfileService, ProfileUpdateError } from '@/lib/services/profileService';
import { errorBody } from '@/lib/tutoring/errorCodes';

export const dynamic = 'force-dynamic';

export async function GET() {
  const service = createProfileService(getDb());
  return NextResponse.json(service.getProfile());
}

export async function PATCH(request: Request) {
  const body = await request.json();
  const service = createProfileService(getDb());
  try {
    return NextResponse.json(service.updateProfile(body));
  } catch (err) {
    if (err instanceof ProfileUpdateError) return NextResponse.json(errorBody(err.message, err.code, err.params), { status: 400 });
    throw err;
  }
}

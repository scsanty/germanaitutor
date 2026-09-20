import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { createProfileService } from '@/lib/services/profileService';

export async function GET() {
  const service = createProfileService(getDb());
  return NextResponse.json(service.getProfile());
}

export async function PATCH(request: Request) {
  const body = await request.json();
  const service = createProfileService(getDb());
  return NextResponse.json(service.updateProfile(body));
}

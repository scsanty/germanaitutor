import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { createUsageService } from '@/lib/services/usageService';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const connectionId = Number(url.searchParams.get('connectionId'));
  const days = Number(url.searchParams.get('days') ?? '30');
  const service = createUsageService(getDb());
  return NextResponse.json(service.getUsageHistory(connectionId, days));
}

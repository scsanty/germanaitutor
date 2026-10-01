import { NextResponse } from 'next/server';
import { getDb } from '@/lib/db/client';
import { createDashboardService } from '@/lib/services/dashboardService';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json(createDashboardService(getDb()).getDashboard());
}

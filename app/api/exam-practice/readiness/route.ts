import { getDb } from '@/lib/db/client';
import { createExamPracticeService } from '@/lib/services/examPracticeService';
import { respond } from '../respond';

export const dynamic = 'force-dynamic';

export async function GET() {
  return respond(() => createExamPracticeService(getDb()).readiness());
}

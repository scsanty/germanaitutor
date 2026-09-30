import type { ReactNode } from 'react';
import { AdminNav } from '@/components/admin/AdminNav';

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="mx-auto w-full min-w-0 max-w-6xl">
      <AdminNav />
      {children}
    </div>
  );
}

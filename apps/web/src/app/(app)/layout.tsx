import type { ReactNode } from 'react';
import { AuthGuard } from '@/components/shell/auth-guard';
import { Sidebar } from '@/components/shell/sidebar';
import { Header } from '@/components/shell/header';

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGuard>
      <div className="flex min-h-screen">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <Header />
          <main className="flex-1 overflow-x-hidden p-4 md:p-6">{children}</main>
        </div>
      </div>
    </AuthGuard>
  );
}

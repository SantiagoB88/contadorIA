import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AuthProvider } from '@/lib/auth-context';
import { OrgProvider } from '@/lib/org-context';
import { AppQueryProvider } from '@/lib/query-client';
import { Toaster } from '@/components/ui/toaster';
import './globals.css';

export const metadata: Metadata = {
  title: 'DashGoBo',
  description: 'Plataforma de facturación para Argentina',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body className="min-h-screen antialiased">
        <AppQueryProvider>
          <AuthProvider>
            <OrgProvider>{children}</OrgProvider>
          </AuthProvider>
        </AppQueryProvider>
        <Toaster />
      </body>
    </html>
  );
}

import { Settings } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';

export default function AccountSettingsPage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Configuración</h1>
        <p className="text-sm text-[var(--color-muted)]">Preferencias de tu cuenta personal.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Preferencias</CardTitle>
        </CardHeader>
        <CardContent>
          <EmptyState
            icon={Settings}
            title="Todavía no hay preferencias para configurar"
            description="Los datos fiscales de tu empresa están en Mi empresa."
          />
        </CardContent>
      </Card>
    </div>
  );
}

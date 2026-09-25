'use client';

import { useMemo, useState } from 'react';
import { ListChecks } from 'lucide-react';
import { useObligations } from '@/lib/hooks/use-obligations';
import { filterObligationsByTab, type ObligationTab } from '@/lib/portal/selectors';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ObligationsTable } from '@/components/portal/obligations-table';

const TABS: { value: ObligationTab; label: string }[] = [
  { value: 'PENDING', label: 'Pendientes' },
  { value: 'DUE_SOON', label: 'Próximas' },
  { value: 'PAID', label: 'Pagadas' },
  { value: 'ALL', label: 'Todas' },
];

export default function ObligationsPage() {
  const [tab, setTab] = useState<ObligationTab>('PENDING');
  const [period, setPeriod] = useState('ALL');
  const [concept, setConcept] = useState('ALL');
  const { data: obligations, isLoading } = useObligations();

  const periods = useMemo(
    () => Array.from(new Set((obligations ?? []).map((o) => o.period))),
    [obligations],
  );
  const concepts = useMemo(
    () => Array.from(new Set((obligations ?? []).map((o) => o.concept))),
    [obligations],
  );

  const filtered = useMemo(() => {
    let data = filterObligationsByTab(obligations ?? [], tab);
    if (period !== 'ALL') data = data.filter((o) => o.period === period);
    if (concept !== 'ALL') data = data.filter((o) => o.concept === concept);
    return data;
  }, [obligations, tab, period, concept]);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Mis obligaciones</h1>
        <p className="text-sm text-[var(--color-muted)]">
          Todo lo que tenés que presentar y pagar frente a los organismos.
        </p>
      </div>

      <Tabs value={tab} onValueChange={(v) => setTab(v as ObligationTab)}>
        <TabsList>
          {TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value}>
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <div className="mt-4 flex flex-wrap gap-3">
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="max-w-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todos los períodos</SelectItem>
              {periods.map((p) => (
                <SelectItem key={p} value={p}>
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={concept} onValueChange={setConcept}>
            <SelectTrigger className="max-w-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Todos los impuestos</SelectItem>
              {concepts.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {TABS.map((t) => (
          <TabsContent key={t.value} value={t.value}>
            <Card>
              {isLoading ? (
                <div className="space-y-2 p-4">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-10" />
                  ))}
                </div>
              ) : filtered.length === 0 ? (
                <EmptyState
                  icon={ListChecks}
                  title="No hay obligaciones en esta vista"
                  description="Probá cambiar los filtros o la pestaña."
                />
              ) : (
                <ObligationsTable obligations={filtered} />
              )}
            </Card>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

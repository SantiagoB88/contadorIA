'use client';

import Link from 'next/link';
import { CheckCircle2, FileCheck2, FolderOpen, Wallet } from 'lucide-react';
import { useAuth } from '@/lib/auth-context';
import { formatMoney } from '@/lib/money';
import { useObligations } from '@/lib/hooks/use-obligations';
import { usePayments } from '@/lib/hooks/use-payments';
import { useAttentionItems } from '@/lib/hooks/use-attention-items';
import { useDocuments } from '@/lib/hooks/use-documents';
import { usePortalSummary } from '@/lib/hooks/use-portal-summary';
import { getRecentPayments, getUpcomingObligations } from '@/lib/portal/selectors';
import { formatDate } from '@/lib/portal/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { StatTile } from '@/components/dashboard/stat-tile';
import { ObligationCard } from '@/components/portal/obligation-card';
import { ObligationsTable } from '@/components/portal/obligations-table';
import { PaymentRow } from '@/components/portal/payment-row';
import { AttentionItemCard } from '@/components/portal/attention-item';
import { UploadDocumentDialog } from '@/components/portal/upload-document-dialog';

export default function DashboardPage() {
  const { user } = useAuth();
  const obligationsQuery = useObligations();
  const paymentsQuery = usePayments();
  const attentionQuery = useAttentionItems();
  const documentsQuery = useDocuments();
  const { summary } = usePortalSummary();

  const isLoading =
    obligationsQuery.isLoading ||
    paymentsQuery.isLoading ||
    attentionQuery.isLoading ||
    documentsQuery.isLoading ||
    !summary;

  const obligations = obligationsQuery.data ?? [];
  const payments = paymentsQuery.data ?? [];
  const attentionItems = attentionQuery.data ?? [];
  const documents = documentsQuery.data ?? [];
  const upcoming = getUpcomingObligations(obligations);
  const recentPayments = getRecentPayments(payments, 5);
  const newDocuments = documents.filter(
    (d) => d.source === 'STUDIO' && Date.now() - new Date(d.uploadedAt).getTime() < 7 * 24 * 60 * 60 * 1000,
  );
  const pendingToSend = attentionItems.filter((i) => i.cta.type === 'UPLOAD_DOCUMENT');
  const obligationById = new Map(obligations.map((o) => [o.id, o]));

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Hola, {user?.firstName}</h1>
        <p className="text-sm text-[var(--color-muted)]">Este es el estado de tu empresa.</p>
      </div>

      {isLoading ? (
        <DashboardSkeleton />
      ) : (
        <>
          <section className="space-y-3">
            <h2 className="text-lg font-semibold">Próximos vencimientos</h2>
            {upcoming.length === 0 ? (
              <EmptyState icon={CheckCircle2} title="No tenés vencimientos próximos" />
            ) : (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {upcoming.slice(0, 3).map((o) => (
                  <ObligationCard key={o.id} obligation={o} />
                ))}
              </div>
            )}
          </section>

          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile
              label="Total a pagar"
              value={formatMoney(summary.totalDue)}
              secondary={`${summary.totalDueCount} obligaciones pendientes`}
              icon={<Wallet className="h-4 w-4" />}
              tone={summary.totalDueCount > 0 ? 'warning' : 'default'}
            />
            <StatTile
              label="Próximo vencimiento"
              value={summary.nextObligation ? summary.nextObligation.concept : '—'}
              secondary={
                summary.nextObligation
                  ? `${formatDate(summary.nextObligation.dueDate)} · ${formatMoney(summary.nextObligation.amount)}`
                  : 'Sin vencimientos próximos'
              }
              icon={<FileCheck2 className="h-4 w-4" />}
            />
            <StatTile
              label="Pagado este mes"
              value={formatMoney(summary.paidThisMonth)}
              secondary={`${summary.paidThisMonthCount} obligaciones pagadas`}
              icon={<CheckCircle2 className="h-4 w-4" />}
              tone="success"
            />
            <StatTile
              label="Pendientes con el estudio"
              value={String(summary.attentionCount)}
              secondary={summary.attentionCount > 0 ? 'Requieren tu atención' : 'Todo al día'}
              icon={<FolderOpen className="h-4 w-4" />}
              tone={summary.attentionCount > 0 ? 'danger' : 'success'}
            />
          </section>

          <Card>
            <CardHeader>
              <CardTitle>Requiere tu atención</CardTitle>
            </CardHeader>
            <CardContent className="p-0 px-6">
              {attentionItems.length === 0 ? (
                <EmptyState
                  icon={CheckCircle2}
                  title="Todo al día"
                  description="No tenés acciones pendientes por el momento."
                />
              ) : (
                attentionItems.map((item) => (
                  <AttentionItemCard
                    key={item.id}
                    item={item}
                    obligation={item.cta.obligationId ? obligationById.get(item.cta.obligationId) : undefined}
                  />
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Próximos vencimientos</CardTitle>
              <Button variant="outline" size="sm" asChild>
                <Link href="/obligations">Ver todas las obligaciones</Link>
              </Button>
            </CardHeader>
            <CardContent>
              {upcoming.length === 0 ? (
                <EmptyState title="No tenés obligaciones pendientes" />
              ) : (
                <ObligationsTable obligations={upcoming} />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Últimos pagos</CardTitle>
              <Button variant="outline" size="sm" asChild>
                <Link href="/payments">Ver historial de pagos</Link>
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {recentPayments.length === 0 ? (
                <EmptyState title="Todavía no registramos pagos" />
              ) : (
                recentPayments.map((p) => <PaymentRow key={p.id} payment={p} />)
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Documentación</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center justify-between gap-4">
              <p className="text-sm text-[var(--color-muted)]">
                {newDocuments.length} documentos nuevos · {pendingToSend.length} documento
                {pendingToSend.length === 1 ? '' : 's'} pendiente{pendingToSend.length === 1 ? '' : 's'} de
                enviar
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" asChild>
                  <Link href="/documents">Ver documentos</Link>
                </Button>
                <UploadDocumentDialog>
                  <Button size="sm">Subir documento</Button>
                </UploadDocumentDialog>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-40" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <Skeleton className="h-48" />
      <Skeleton className="h-64" />
    </div>
  );
}

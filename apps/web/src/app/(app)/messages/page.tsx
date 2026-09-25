'use client';

import { useState } from 'react';
import { MessagesSquare } from 'lucide-react';
import { useConsultations, useReplyToConsultation } from '@/lib/hooks/use-messages';
import { formatDate } from '@/lib/portal/format';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { PortalStatusBadge } from '@/components/portal/status-badge';
import { NewConsultationDialog } from '@/components/portal/new-consultation-dialog';

export default function MessagesPage() {
  const { data: consultations, isLoading } = useConsultations();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = consultations?.find((c) => c.id === selectedId) ?? consultations?.[0] ?? null;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Mensajes / Consultas</h1>
          <p className="text-sm text-[var(--color-muted)]">Comunicate directo con el equipo del estudio.</p>
        </div>
        <NewConsultationDialog>
          <Button>Nueva consulta</Button>
        </NewConsultationDialog>
      </div>

      {isLoading ? (
        <Skeleton className="h-96" />
      ) : !consultations || consultations.length === 0 ? (
        <EmptyState
          icon={MessagesSquare}
          title="Todavía no hiciste ninguna consulta"
          description="Cuando tengas una duda, escribile al estudio desde acá."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_1fr]">
          <Card className="divide-y divide-[var(--color-border)] p-0">
            {consultations.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setSelectedId(c.id)}
                className={cn(
                  'block w-full px-4 py-3 text-left text-sm transition-colors hover:bg-[var(--color-surface-hover)]',
                  selected?.id === c.id && 'bg-[var(--color-surface-hover)]',
                )}
              >
                <p className="font-medium">{c.subject}</p>
                <div className="mt-1 flex items-center justify-between gap-2">
                  <span className="text-xs text-[var(--color-muted)]">{formatDate(c.updatedAt)}</span>
                  <PortalStatusBadge status={c.status} />
                </div>
              </button>
            ))}
          </Card>

          {selected && <ConsultationThread consultationId={selected.id} subject={selected.subject} messages={selected.messages} />}
        </div>
      )}
    </div>
  );
}

function ConsultationThread({
  consultationId,
  subject,
  messages,
}: {
  consultationId: string;
  subject: string;
  messages: { id: string; author: 'CLIENT' | 'STUDIO'; text: string; sentAt: string }[];
}) {
  const [text, setText] = useState('');
  const reply = useReplyToConsultation();

  async function handleReply() {
    if (!text.trim()) return;
    await reply.mutateAsync({ consultationId, text: text.trim() });
    setText('');
  }

  return (
    <Card className="flex flex-col gap-4 p-4">
      <h2 className="font-medium">{subject}</h2>

      <div className="flex flex-col gap-3">
        {messages.map((m) => (
          <div
            key={m.id}
            className={cn(
              'max-w-[80%] rounded-lg p-3 text-sm',
              m.author === 'CLIENT'
                ? 'self-end bg-[var(--color-accent)] text-[var(--color-accent-fg)]'
                : 'self-start bg-[var(--color-surface-muted)]',
            )}
          >
            <p>{m.text}</p>
            <p className="mt-1 text-xs opacity-70">{formatDate(m.sentAt)}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Escribí tu mensaje…"
          rows={2}
        />
        <Button onClick={() => void handleReply()} disabled={!text.trim() || reply.isPending}>
          Enviar
        </Button>
      </div>
    </Card>
  );
}

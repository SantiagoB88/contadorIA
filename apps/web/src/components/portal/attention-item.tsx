import Link from 'next/link';
import { AlertTriangle, CreditCard, FileText, MessageSquare } from 'lucide-react';
import { formatDate } from '@/lib/portal/format';
import type { AttentionItem, Obligation } from '@/lib/portal/types';
import { Button } from '@/components/ui/button';
import { UploadDocumentDialog } from './upload-document-dialog';
import { PayDialog } from './pay-dialog';

const ICONS = {
  document: FileText,
  obligation: AlertTriangle,
  payment: CreditCard,
  message: MessageSquare,
} as const;

export function AttentionItemCard({
  item,
  obligation,
}: {
  item: AttentionItem;
  /** Required when `item.cta.type === 'PAY'` so the dialog has amount/dates to show. */
  obligation?: Obligation;
}) {
  const Icon = ICONS[item.icon];

  return (
    <div className="flex items-start gap-3 border-b border-[var(--color-border)] py-4 last:border-0">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--color-warning-bg)] text-[var(--color-warning)]">
        <Icon className="h-4 w-4" aria-hidden />
      </span>
      <div className="flex-1 space-y-1">
        <p className="text-sm font-medium">{item.title}</p>
        <p className="text-sm text-[var(--color-muted)]">{item.description}</p>
        {item.dueDate && (
          <p className="text-xs text-[var(--color-muted)]">Límite: {formatDate(item.dueDate)}</p>
        )}
      </div>
      <AttentionCta item={item} obligation={obligation} />
    </div>
  );
}

function AttentionCta({ item, obligation }: { item: AttentionItem; obligation?: Obligation }) {
  const { cta } = item;

  if (cta.type === 'UPLOAD_DOCUMENT') {
    return (
      <UploadDocumentDialog>
        <Button size="sm" variant="outline">
          {cta.label}
        </Button>
      </UploadDocumentDialog>
    );
  }

  if (cta.type === 'PAY' && obligation) {
    return (
      <PayDialog obligation={obligation}>
        <Button size="sm">{cta.label}</Button>
      </PayDialog>
    );
  }

  return (
    <Button size="sm" variant="outline" asChild>
      <Link href={cta.href ?? (cta.type === 'REPLY' ? '/messages' : '/obligations')}>{cta.label}</Link>
    </Button>
  );
}

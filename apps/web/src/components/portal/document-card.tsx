import { Download, Eye, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { formatDate } from '@/lib/portal/format';
import { DOCUMENT_CATEGORY_LABELS } from '@/lib/portal/labels';
import type { PortalDocument } from '@/lib/portal/types';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

export function DocumentCard({ document }: { document: PortalDocument }) {
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-start justify-between gap-2">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--color-accent)]/10 text-[var(--color-accent)]">
          <FileText className="h-4 w-4" aria-hidden />
        </span>
        <Badge variant={document.source === 'STUDIO' ? 'info' : 'outline'}>
          {document.source === 'STUDIO' ? 'Del estudio' : 'Subido por vos'}
        </Badge>
      </div>

      <div>
        <p className="line-clamp-2 text-sm font-medium">{document.name}</p>
        <p className="mt-1 text-xs text-[var(--color-muted)]">
          {DOCUMENT_CATEGORY_LABELS[document.category]} · {formatDate(document.uploadedAt)} ·{' '}
          {document.sizeLabel}
        </p>
      </div>

      <div className="mt-auto flex gap-2">
        <Button
          size="sm"
          variant="outline"
          className="flex-1"
          onClick={() => toast.info('Vista previa no disponible en esta demo')}
        >
          <Eye className="h-3.5 w-3.5" />
          Ver
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="flex-1"
          onClick={() => toast.info('Descarga no disponible en esta demo')}
        >
          <Download className="h-3.5 w-3.5" />
          Descargar
        </Button>
      </div>
    </Card>
  );
}

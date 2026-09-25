'use client';

import { useState } from 'react';
import { FolderOpen } from 'lucide-react';
import { useDocuments } from '@/lib/hooks/use-documents';
import { DOCUMENT_CATEGORY_OPTIONS } from '@/lib/portal/labels';
import type { DocumentCategory } from '@/lib/portal/types';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DocumentCard } from '@/components/portal/document-card';
import { UploadDocumentDialog } from '@/components/portal/upload-document-dialog';

export default function DocumentsPage() {
  const [category, setCategory] = useState<DocumentCategory | 'ALL'>('ALL');
  const { data: documents, isLoading } = useDocuments({ category });

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Documentos</h1>
          <p className="text-sm text-[var(--color-muted)]">
            Todo lo que subiste vos y todo lo que te compartió el estudio.
          </p>
        </div>
        <UploadDocumentDialog>
          <Button>Subir documento</Button>
        </UploadDocumentDialog>
      </div>

      <Select value={category} onValueChange={(v) => setCategory(v as DocumentCategory | 'ALL')}>
        <SelectTrigger className="max-w-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">Todas las categorías</SelectItem>
          {DOCUMENT_CATEGORY_OPTIONS.map(([value, label]) => (
            <SelectItem key={value} value={value}>
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-36" />
          ))}
        </div>
      ) : !documents || documents.length === 0 ? (
        <EmptyState icon={FolderOpen} title="No hay documentos en esta categoría" />
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {documents.map((doc) => (
            <DocumentCard key={doc.id} document={doc} />
          ))}
        </div>
      )}
    </div>
  );
}

'use client';

import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { useUploadDocument } from '@/lib/hooks/use-documents';
import { DOCUMENT_CATEGORY_OPTIONS } from '@/lib/portal/labels';
import type { DocumentCategory } from '@/lib/portal/types';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export function UploadDocumentDialog({
  children,
  defaultCategory = 'OTROS',
}: {
  children: ReactNode;
  defaultCategory?: DocumentCategory;
}) {
  const [open, setOpen] = useState(false);
  const [fileName, setFileName] = useState('');
  const [category, setCategory] = useState<DocumentCategory>(defaultCategory);
  const upload = useUploadDocument();

  async function handleSubmit() {
    if (!fileName.trim()) return;
    await upload.mutateAsync({ name: fileName.trim(), category });
    toast.success('Documento subido');
    setOpen(false);
    setFileName('');
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Subir documento</DialogTitle>
          <DialogDescription>
            Esta demo guarda el archivo solo en tu sesión — todavía no hay un backend conectado.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="doc-file">Archivo</Label>
            <Input
              id="doc-file"
              type="file"
              onChange={(e) => setFileName(e.target.files?.[0]?.name ?? '')}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="doc-category">Categoría</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as DocumentCategory)}>
              <SelectTrigger id="doc-category">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DOCUMENT_CATEGORY_OPTIONS.map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancelar</Button>
          </DialogClose>
          <Button onClick={() => void handleSubmit()} disabled={!fileName || upload.isPending}>
            {upload.isPending ? 'Subiendo…' : 'Subir'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

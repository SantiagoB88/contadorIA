'use client';

import { useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { useCreateConsultation } from '@/lib/hooks/use-messages';
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
import { Textarea } from '@/components/ui/textarea';

export function NewConsultationDialog({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState('');
  const [text, setText] = useState('');
  const create = useCreateConsultation();

  async function handleSubmit() {
    if (!subject.trim() || !text.trim()) return;
    await create.mutateAsync({ subject: subject.trim(), text: text.trim() });
    toast.success('Consulta enviada');
    setOpen(false);
    setSubject('');
    setText('');
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nueva consulta</DialogTitle>
          <DialogDescription>Le llega directo al equipo del estudio.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="consultation-subject">Asunto</Label>
            <Input
              id="consultation-subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Ej: Consulta sobre un vencimiento"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="consultation-text">Mensaje</Label>
            <Textarea
              id="consultation-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              rows={4}
            />
          </div>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancelar</Button>
          </DialogClose>
          <Button
            onClick={() => void handleSubmit()}
            disabled={!subject.trim() || !text.trim() || create.isPending}
          >
            {create.isPending ? 'Enviando…' : 'Enviar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

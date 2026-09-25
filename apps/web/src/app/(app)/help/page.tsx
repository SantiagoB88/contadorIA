import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const FAQS = [
  {
    q: '¿Cómo pago una obligación?',
    a: 'Entrá a Mis obligaciones o Pagos y tocá "Pagar" — vas a ver los datos para transferir.',
  },
  {
    q: '¿Cómo le envío un documento al estudio?',
    a: 'Desde Documentos o desde cualquier tarjeta de "Requiere tu atención", con el botón "Subir documento".',
  },
  {
    q: '¿Cómo consulto algo puntual?',
    a: 'Desde Mensajes / Consultas, con el botón "Nueva consulta".',
  },
];

export default function HelpPage() {
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Ayuda</h1>
        <p className="text-sm text-[var(--color-muted)]">Preguntas frecuentes sobre el portal.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Preguntas frecuentes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {FAQS.map((f) => (
            <div key={f.q}>
              <p className="text-sm font-medium">{f.q}</p>
              <p className="text-sm text-[var(--color-muted)]">{f.a}</p>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

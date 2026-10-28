import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { REQUEST_STATUS, ROLES } from "@/lib/constants";
import { formatCuit } from "@/lib/cuit";
import { formatDateAR, formatDateTimeAR, monthKey, parseYmd } from "@/lib/dates";
import { getAccessibleTaxpayers, getAuthorizedTaxpayer } from "@/modules/taxpayers/access";
import { getDashboardData, monthOptions, resolveCutDate } from "@/modules/dashboard/metrics";
import { TaxpayerPicker } from "@/components/dashboard/TaxpayerPicker";
import { MarginCard, MonthlyChart, PeriodCard } from "@/components/dashboard/DashboardCards";
import { Badge, EmptyState, Notice, PageHeader } from "@/components/ui";

export const metadata = { title: "Inicio · ContadorSmart" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export default async function DashboardPage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser();
  const sp = await searchParams;
  const taxpayers = await getAccessibleTaxpayers(user);

  if (taxpayers.length === 0) {
    const pending =
      user.role === ROLES.CLIENTE
        ? await prisma.accessRequest.count({ where: { userId: user.id, status: REQUEST_STATUS.PENDIENTE } })
        : 0;
    return (
      <div className="space-y-6">
        <PageHeader title={`Hola, ${user.name.split(" ")[0]}`} />
        <EmptyState title="Todavía no tenés contribuyentes habilitados">
          {user.role === ROLES.ADMIN ? (
            "El estudio no tiene contribuyentes cargados."
          ) : pending > 0 ? (
            <p>
              Tenés {pending} {pending === 1 ? "solicitud pendiente" : "solicitudes pendientes"} de validación. Cuando el
              estudio la apruebe, vas a ver acá tu facturación y tu categoría.{" "}
              <Link href="/perfil" className="font-medium text-brand-700 hover:underline">
                Ver estado
              </Link>
            </p>
          ) : (
            <div className="space-y-4">
              <p>Asociá tu CUIT para que el estudio lo valide. Después vas a ver acá tu facturación y tu categoría.</p>
              <Link
                href="/perfil#asociar"
                className="inline-flex rounded-lg bg-brand-600 px-4 py-2.5 font-medium text-white hover:bg-brand-700"
              >
                Asociar mi CUIT
              </Link>
            </div>
          )}
        </EmptyState>
      </div>
    );
  }

  const requestedId = first(sp.c) ?? taxpayers[0].id;
  const taxpayer = await getAuthorizedTaxpayer(user, requestedId);

  if (!taxpayer) {
    // El control es en el servidor: una URL manipulada no muestra datos ajenos.
    return (
      <div className="space-y-6">
        <PageHeader title="Sin permiso" />
        <Notice tone="danger" title="No tenés acceso a este contribuyente">
          Si creés que es un error, pedile al estudio que revise tus accesos.{" "}
          <Link href="/dashboard" className="font-medium underline">
            Volver a mi inicio
          </Link>
        </Notice>
      </div>
    );
  }

  const cutDate = resolveCutDate(first(sp.mes));
  const { year, month } = parseYmd(cutDate);
  const data = await getDashboardData(taxpayer, cutDate);

  return (
    <div className="space-y-6">
      <PageHeader
        title={taxpayer.name}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>CUIT {formatCuit(taxpayer.cuit)}</span>
            <span>{taxpayer.activity}</span>
            <span>Monotributo · Cat. {taxpayer.categoryCode ?? "sin cargar"}</span>
          </span>
        }
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <TaxpayerPicker
            action="/dashboard"
            taxpayers={taxpayers.map((t) => ({ id: t.id, label: t.name }))}
            selectedId={taxpayer.id}
            months={monthOptions()}
            selectedMonth={monthKey(year, month)}
          />
          <Link
            href={`/facturas/nueva?c=${taxpayer.id}`}
            className="inline-flex items-center justify-center whitespace-nowrap rounded-lg bg-brand-600 px-4 py-2.5 font-medium text-white hover:bg-brand-700"
          >
            Nueva factura
          </Link>
        </div>
      </PageHeader>

      <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
        <Badge tone="brand">Fecha de corte {formatDateAR(data.cutDate)}</Badge>
        {data.coverage ? (
          <>
            <Badge tone={data.coverage.complete ? "success" : "warning"}>
              {data.coverage.complete ? "Datos completos" : "Datos parciales"}
            </Badge>
            <span>
              {data.coverage.source} · actualizado {formatDateTimeAR(data.coverage.updatedAt)}
            </span>
          </>
        ) : (
          <Badge tone="warning">Sin datos cargados</Badge>
        )}
      </div>

      {!data.coverage && (
        <Notice tone="warning" title="Información incompleta">
          El estudio todavía no cargó la facturación de este contribuyente. Los indicadores se van a mostrar cuando haya datos.
        </Notice>
      )}
      {data.coverage && !data.coverage.complete && (
        <Notice tone="warning" title="Información incompleta">
          Solo hay datos desde el {formatDateAR(data.coverage.fromDate)}. Los períodos anteriores no se pueden calcular con
          seguridad.
        </Notice>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {data.periods.map((p) => (
          <PeriodCard key={p.key} period={p} taxpayerId={taxpayer.id} />
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <MarginCard margin={data.margin} />
        </div>
        <div className="min-w-0 lg:col-span-3">
          <MonthlyChart bars={data.chart} />
        </div>
      </div>

      <p className="text-xs text-slate-500">
        Moneda {data.currency} · Ambiente {data.environment} · Reglas {data.rulesVersion} · Suman los comprobantes
        verificados y, solo en la demo, las facturas emitidas en simulación. Borradores y rechazos no se cuentan.
      </p>
    </div>
  );
}

// Datos ficticios de demo. Sin personas ni CUIT reales; escala de categorías inventada.
// Uso: `npm run db:setup` (base vacía) o `npm run db:reset` (borra todo y vuelve a sembrar).
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";

const prisma = new PrismaClient();

const DEMO_PASSWORD = "Demo1234!";

function todayAR(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

const pad = (n: number) => String(n).padStart(2, "0");

function shiftMonth(year: number, month: number, delta: number) {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

const pesos = (n: number) => BigInt(Math.round(n * 100));

function addDays(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + delta));
  return date.toISOString().slice(0, 10);
}

// Escala FICTICIA (no son valores de ARCA): límite anual de ingresos por categoría.
const DEMO_SCALE: [string, number][] = [
  ["A", 8_000_000], ["B", 12_000_000], ["C", 17_000_000], ["D", 21_000_000],
  ["E", 25_000_000], ["F", 31_000_000], ["G", 37_000_000], ["H", 57_000_000],
  ["I", 63_000_000], ["J", 73_000_000], ["K", 85_000_000],
];

type Profile = {
  key: string;
  name: string;
  cuit: string;
  activity: string;
  category: string | null;
  monthlyIncome: number; // facturación mensual aproximada en pesos
  monthsWithData: number; // cuántos meses hacia atrás tienen datos completos
  startMonthsAgo: number; // inicio de actividad
};

// Seis perfiles del plan: sin actividad, normal, preventivo, próximo, superado, incompleto.
const PROFILES: Profile[] = [
  { key: "ana", name: "Ana Gómez", cuit: "27000000014", activity: "Diseño gráfico", category: "D", monthlyIncome: 1_100_000, monthsWithData: 24, startMonthsAgo: 36 },
  { key: "martin", name: "Martín Gómez", cuit: "20000000028", activity: "Clases particulares", category: "B", monthlyIncome: 980_000, monthsWithData: 24, startMonthsAgo: 30 },
  { key: "bruno", name: "Bruno Díaz", cuit: "20000000036", activity: "Reparación de PC", category: "C", monthlyIncome: 1_550_000, monthsWithData: 24, startMonthsAgo: 40 },
  { key: "carla", name: "Carla Ruiz", cuit: "27000000049", activity: "Traducciones", category: "A", monthlyIncome: 0, monthsWithData: 24, startMonthsAgo: 20 },
  { key: "diego", name: "Diego Fernández", cuit: "20000000052", activity: "Fotografía", category: "E", monthlyIncome: 1_300_000, monthsWithData: 4, startMonthsAgo: 26 },
  { key: "elena", name: "Elena Paz", cuit: "27000000065", activity: "Consultoría", category: "F", monthlyIncome: 2_200_000, monthsWithData: 24, startMonthsAgo: 50 },
];

const RECIPIENTS = ["Cliente Ficticio SRL", "Comercio Demo SA", "Consumidor Final", "Empresa de Prueba SAS", "Estudio Ejemplo"];

async function wipe() {
  await prisma.auditEvent.deleteMany();
  await prisma.obligation.deleteMany();
  await prisma.debtReview.deleteMany();
  await prisma.categoryHistory.deleteMany();
  await prisma.invoiceAttempt.deleteMany();
  await prisma.invoiceItem.deleteMany();
  await prisma.invoiceSequence.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.invoiceRecipient.deleteMany();
  await prisma.dataCoverage.deleteMany();
  await prisma.taxpayerAccess.deleteMany();
  await prisma.accessRequest.deleteMany();
  await prisma.authToken.deleteMany();
  await prisma.outboxEmail.deleteMany();
  await prisma.appMeta.deleteMany();
  await prisma.session.deleteMany();
  await prisma.user.deleteMany();
  await prisma.taxpayer.deleteMany();
  await prisma.taxCategoryLimit.deleteMany();
  await prisma.taxScaleVersion.deleteMany();
  await prisma.study.deleteMany();
}

async function main() {
  const reset = process.argv.includes("--reset");
  const existing = await prisma.study.count();
  if (existing > 0 && !reset) {
    console.log("La base ya tiene datos. No se modificó nada. Para empezar de cero: npm run db:reset");
    return;
  }
  if (reset) await wipe();

  const today = todayAR();
  const [ty, tm, td] = today.split("-").map(Number);
  const passwordHash = await hash(DEMO_PASSWORD, 10);

  const study = await prisma.study.create({ data: { name: "Estudio Demo", acceptsSignups: true } });
  // Segundo estudio solo para comprobar aislamiento.
  const otherStudy = await prisma.study.create({ data: { name: "Estudio Aislamiento (pruebas)" } });

  // Dos versiones FICTICIAS por estudio: la del año pasado (límites más bajos) y la vigente desde el 1/1.
  // Así se ve que cada fecha de corte usa la escala de su momento.
  for (const s of [study, otherStudy]) {
    await prisma.taxScaleVersion.create({
      data: {
        studyId: s.id,
        name: `Escala ficticia ${ty - 1}`,
        source: "Valores inventados para la demo. No usar para decisiones fiscales.",
        status: "DEMO",
        validFrom: "2020-01-01",
        validTo: `${ty - 1}-12-31`,
        limits: { create: DEMO_SCALE.map(([code, limit]) => ({ code, annualLimitCents: pesos(Math.round(limit * 0.8)) })) },
      },
    });
    await prisma.taxScaleVersion.create({
      data: {
        studyId: s.id,
        name: `Escala ficticia ${ty}`,
        source: "Valores inventados para la demo. No usar para decisiones fiscales.",
        status: "DEMO",
        validFrom: `${ty}-01-01`,
        limits: { create: DEMO_SCALE.map(([code, limit]) => ({ code, annualLimitCents: pesos(limit) })) },
      },
    });
  }

  const admin = await prisma.user.create({
    data: { studyId: study.id, email: "admin@contadorsmart.local", name: "Rodrigo (Admin demo)", passwordHash, role: "ADMIN", emailVerifiedAt: new Date() },
  });
  const clienteA = await prisma.user.create({
    data: { studyId: study.id, email: "cliente.a@contadorsmart.local", name: "Ana Gómez", phone: "+54 11 0000-0001", passwordHash, role: "CLIENTE", emailVerifiedAt: new Date() },
  });
  const clienteB = await prisma.user.create({
    data: { studyId: study.id, email: "cliente.b@contadorsmart.local", name: "Bruno Díaz", phone: "+54 11 0000-0002", passwordHash, role: "CLIENTE", emailVerifiedAt: new Date() },
  });
  await prisma.user.create({
    data: { studyId: otherStudy.id, email: "admin.otro@contadorsmart.local", name: "Admin otro estudio", passwordHash, role: "ADMIN", emailVerifiedAt: new Date() },
  });

  const taxpayers: Record<string, string> = {};
  for (const p of PROFILES) {
    const start = shiftMonth(ty, tm, -p.startMonthsAgo);
    const tp = await prisma.taxpayer.create({
      data: {
        studyId: study.id,
        cuit: p.cuit,
        name: p.name,
        activity: p.activity,
        categoryCode: p.category,
        startDate: `${start.year}-${pad(start.month)}-01`,
      },
    });
    taxpayers[p.key] = tp.id;
    if (p.category) {
      await prisma.categoryHistory.create({
        data: { taxpayerId: tp.id, code: p.category, validFrom: tp.startDate, reason: "Categoría inicial (datos de demo)", createdById: admin.id },
      });
    }

    const covStart = shiftMonth(ty, tm, -(p.monthsWithData - 1));
    await prisma.dataCoverage.create({
      data: {
        taxpayerId: tp.id,
        fromDate: `${covStart.year}-${pad(covStart.month)}-01`,
        complete: p.monthsWithData >= 24,
        source: "Cargado por el estudio",
      },
    });

    if (p.monthlyIncome === 0) continue;

    // Dos comprobantes por mes, con una variación determinística (sin azar).
    const invoices = [];
    for (let i = 0; i < p.monthsWithData; i++) {
      const m = shiftMonth(ty, tm, -i);
      const factor = 1 + (((i * 37) % 11) - 5) / 100; // entre 0,95 y 1,05
      const monthTotal = p.monthlyIncome * factor;
      const first = Math.round(monthTotal * 0.6 * 100) / 100;
      const second = Math.round((monthTotal - first) * 100) / 100;
      const isCurrentMonth = i === 0;
      const days = isCurrentMonth ? [1, Math.max(1, Math.min(td, 15))] : [5, 20];
      for (const [j, amount] of [first, second].entries()) {
        invoices.push({
          studyId: study.id,
          taxpayerId: tp.id,
          issueDate: `${m.year}-${pad(m.month)}-${pad(days[j])}`,
          recipientName: RECIPIENTS[(i + j) % RECIPIENTS.length],
          description: `Servicios de ${p.activity.toLowerCase()}`,
          amountCents: pesos(amount),
          status: "VERIFICADO",
          source: "DATOS_FICTICIOS",
        });
      }
    }
    await prisma.invoice.createMany({ data: invoices });
  }

  // Un borrador para mostrar que no suma en los indicadores.
  await prisma.invoice.create({
    data: {
      studyId: study.id,
      taxpayerId: taxpayers.ana,
      issueDate: today,
      recipientName: "Comercio Demo SA",
      description: "Borrador (no suma en los totales)",
      amountCents: pesos(500_000),
      status: "BORRADOR",
      source: "DATOS_FICTICIOS",
    },
  });

  // Receptores guardados de Ana, para probar el facturador.
  await prisma.invoiceRecipient.createMany({
    data: [
      { studyId: study.id, taxpayerId: taxpayers.ana, name: "Comercio Demo SA", docType: "CUIT", docNumber: "30000000074", taxCondition: "RESPONSABLE_INSCRIPTO" },
      { studyId: study.id, taxpayerId: taxpayers.ana, name: "Consumidor Final", docType: "SIN_IDENTIFICAR", docNumber: null, taxCondition: "CONSUMIDOR_FINAL" },
    ],
  });

  // Accesos: cliente A ve a Ana y Martín; cliente B solo a Bruno.
  await prisma.taxpayerAccess.createMany({
    data: [
      { userId: clienteA.id, taxpayerId: taxpayers.ana, status: "APROBADO" },
      { userId: clienteA.id, taxpayerId: taxpayers.martin, status: "APROBADO" },
      { userId: clienteB.id, taxpayerId: taxpayers.bruno, status: "APROBADO" },
    ],
  });

  // Solicitud pendiente de cliente B para Elena: hasta que el estudio la apruebe no le da acceso.
  await prisma.accessRequest.create({
    data: {
      studyId: study.id,
      userId: clienteB.id,
      cuit: "27000000065",
      declaredName: "Elena Paz",
      declaredActivity: "Consultoría",
      declaredCategory: "F",
      declaredStartDate: "2022-01-01",
      status: "PENDIENTE",
    },
  });

  // Elena se recategorizó hace 6 meses: antes era E. El historial permite ver la categoría de cada fecha.
  const elenaChange = shiftMonth(ty, tm, -6);
  await prisma.categoryHistory.updateMany({ where: { taxpayerId: taxpayers.elena }, data: { code: "E" } });
  await prisma.categoryHistory.create({
    data: {
      taxpayerId: taxpayers.elena,
      code: "F",
      validFrom: `${elenaChange.year}-${pad(elenaChange.month)}-01`,
      reason: "Recategorización informada por la clienta (demo)",
      createdById: admin.id,
    },
  });

  // Deudas y vencimientos ficticios, cargados "por el estudio".
  const thisPeriod = `${ty}-${pad(tm)}`;
  const prev = (n: number) => {
    const m = shiftMonth(ty, tm, -n);
    return `${m.year}-${pad(m.month)}`;
  };
  const ob = (taxpayerId: string, concept: string, period: string, dueDate: string, amount: number | null, status = "PENDIENTE", statusNote: string | null = null) => ({
    studyId: study.id,
    taxpayerId,
    concept,
    period,
    dueDate,
    amountCents: amount === null ? null : pesos(amount),
    status,
    statusNote,
    createdById: admin.id,
    updatedById: admin.id,
  });
  await prisma.obligation.createMany({
    data: [
      // Ana: al día, con un vencimiento próximo.
      ob(taxpayers.ana, "Cuota mensual monotributo", prev(1), addDays(today, -18), 61_250, "PAGO_VERIFICADO", "Comprobante de pago revisado por el estudio"),
      ob(taxpayers.ana, "Cuota mensual monotributo", thisPeriod, addDays(today, 12), 61_250),
      // Bruno: deuda informada (dos cuotas impagas, una sin importe confirmado) y un vencimiento próximo.
      ob(taxpayers.bruno, "Cuota mensual monotributo", prev(2), addDays(today, -45), 48_900),
      ob(taxpayers.bruno, "Cuota mensual monotributo", prev(1), addDays(today, -15), 48_900),
      ob(taxpayers.bruno, "Plan de pagos · cuota 3", prev(1), addDays(today, -8), null),
      ob(taxpayers.bruno, "Cuota mensual monotributo", thisPeriod, addDays(today, 10), 48_900),
      // Elena: pagó y lo informó, falta que el estudio lo verifique.
      ob(taxpayers.elena, "Cuota mensual monotributo", prev(1), addDays(today, -12), 98_400, "PAGO_INFORMADO", "La clienta envió el comprobante por correo"),
    ],
  });
  await prisma.debtReview.createMany({
    data: [
      { taxpayerId: taxpayers.ana, asOfDate: addDays(today, -1), status: "REVISADA", note: "Revisado con el estado de cuenta (demo)", reviewedById: admin.id },
      { taxpayerId: taxpayers.bruno, asOfDate: addDays(today, -2), status: "REVISADA", note: "Revisado con el estado de cuenta (demo)", reviewedById: admin.id },
      { taxpayerId: taxpayers.carla, asOfDate: addDays(today, -3), status: "REVISADA", reviewedById: admin.id },
      { taxpayerId: taxpayers.elena, asOfDate: addDays(today, -1), status: "REVISADA", reviewedById: admin.id },
    ],
  });

  // Este seed ya incluye los datos de las entregas 2 y 4: no hace falta la actualización de prisma/upgrade.ts.
  await prisma.appMeta.createMany({ data: [{ key: "upgrade-entrega2", value: "seed" }, { key: "upgrade-entrega4", value: "seed" }] });

  // Contribuyente del otro estudio (no debe verse nunca desde Estudio Demo).
  await prisma.taxpayer.create({
    data: { studyId: otherStudy.id, cuit: "30000000074", name: "Zeta Prueba SA", activity: "Comercio", categoryCode: "K", startDate: "2022-01-01" },
  });

  await prisma.auditEvent.create({
    data: { studyId: study.id, actorId: admin.id, action: "SEED", entity: "Study", entityId: study.id, detail: "Datos ficticios de demo creados" },
  });

  console.log("Datos de demo creados. Usuarios (contraseña Demo1234!):");
  console.log("  admin@contadorsmart.local      → administrador del Estudio Demo");
  console.log("  cliente.a@contadorsmart.local  → Ana Gómez y Martín Gómez");
  console.log("  cliente.b@contadorsmart.local  → Bruno Díaz");
  console.log("  admin.otro@contadorsmart.local → otro estudio (aislamiento)");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

// Verificaciones rápidas sin servidor: `npm run verify`.
// Usa la base local sembrada (npm run db:reset para dejarla como al principio).
import assert from "node:assert/strict";
import { compare } from "bcryptjs";
import { prisma } from "@/lib/db";
import { formatARS, parseAmountToCents } from "@/lib/money";
import { todayAR } from "@/lib/dates";
import type { CurrentUser } from "@/lib/auth";
import { alertLevel, getDashboardData, periodRanges } from "@/modules/dashboard/metrics";
import { getAccessibleTaxpayers, getAuthorizedTaxpayer } from "@/modules/taxpayers/access";

let passed = 0;
async function check(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}`);
    throw err;
  }
}

async function asCurrentUser(email: string): Promise<CurrentUser> {
  const u = await prisma.user.findUniqueOrThrow({ where: { email }, include: { study: true } });
  return { id: u.id, studyId: u.studyId, studyName: u.study.name, email: u.email, name: u.name, role: u.role };
}

async function main() {
  console.log("Importes");
  await check("parseo de formatos argentinos", () => {
    assert.equal(parseAmountToCents("1234"), 123400n);
    assert.equal(parseAmountToCents("1.234,56"), 123456n);
    assert.equal(parseAmountToCents("1234,5"), 123450n);
    assert.equal(parseAmountToCents("1234.56"), 123456n);
    assert.equal(parseAmountToCents("$ 1.234.567"), 123456700n);
    assert.equal(parseAmountToCents("0,10"), 10n);
    assert.equal(parseAmountToCents("12,345"), null);
    assert.equal(parseAmountToCents("abc"), null);
    assert.equal(parseAmountToCents(""), null);
  });
  await check("suma exacta de centavos (0,10 + 0,20 = 0,30)", () => {
    assert.equal(parseAmountToCents("0,10")! + parseAmountToCents("0,20")!, 30n);
    assert.match(formatARS(30n), /0,30/);
  });

  console.log("Períodos");
  await check("rangos para el 28/10/2026", () => {
    const r = periodRanges("2026-10-28");
    assert.deepEqual(r.mensual, { from: "2026-10-01", to: "2026-10-28" });
    assert.deepEqual(r.semestral, { from: "2026-07-01", to: "2026-10-28" });
    assert.deepEqual(r.anual, { from: "2026-01-01", to: "2026-10-28" });
    assert.deepEqual(r.movil12, { from: "2025-11-01", to: "2026-10-28" });
  });
  await check("bordes de semestre y año", () => {
    assert.equal(periodRanges("2026-06-30").semestral.from, "2026-01-01");
    assert.equal(periodRanges("2026-07-01").semestral.from, "2026-07-01");
    assert.equal(periodRanges("2026-01-15").movil12.from, "2025-02-01");
    assert.equal(periodRanges("2026-12-31").movil12.from, "2026-01-01");
  });

  console.log("Alertas (exactas al 80, 95 y 100 %)");
  await check("umbrales", () => {
    const limit = 1_000_000n;
    assert.equal(alertLevel(799_999n, limit), "NORMAL");
    assert.equal(alertLevel(800_000n, limit), "PREVENTIVO");
    assert.equal(alertLevel(949_999n, limit), "PREVENTIVO");
    assert.equal(alertLevel(950_000n, limit), "PROXIMO");
    assert.equal(alertLevel(1_000_000n, limit), "PROXIMO");
    assert.equal(alertLevel(1_000_001n, limit), "SUPERADO");
  });

  console.log("Perfiles de demo");
  const today = todayAR();
  const byName = async (name: string) => prisma.taxpayer.findFirstOrThrow({ where: { name } });
  const expectations: [string, string][] = [
    ["Ana Gómez", "NORMAL"],
    ["Elena Paz", "PREVENTIVO"],
    ["Martín Gómez", "PROXIMO"],
    ["Bruno Díaz", "SUPERADO"],
    ["Carla Ruiz", "NORMAL"],
  ];
  for (const [name, level] of expectations) {
    await check(`${name} → ${level}`, async () => {
      const data = await getDashboardData(await byName(name), today);
      assert.ok(data.margin.available, `margen no disponible: ${!data.margin.available && data.margin.reason}`);
      assert.equal(data.margin.level, level);
    });
  }
  await check("Carla Ruiz (sin actividad) muestra cero real, no 'sin datos'", async () => {
    const data = await getDashboardData(await byName("Carla Ruiz"), today);
    assert.equal(data.periods.find((p) => p.key === "movil12")!.totalCents, 0n);
  });
  await check("Diego Fernández → información incompleta, sin margen", async () => {
    const data = await getDashboardData(await byName("Diego Fernández"), today);
    assert.equal(data.margin.available, false);
    assert.equal(data.periods.find((p) => p.key === "movil12")!.coverage, "PARCIAL");
  });
  await check("el borrador de Ana no suma", async () => {
    const ana = await byName("Ana Gómez");
    const data = await getDashboardData(ana, today);
    const mensual = data.periods.find((p) => p.key === "mensual")!;
    const verified = await prisma.invoice.findMany({
      where: { taxpayerId: ana.id, status: "VERIFICADO", issueDate: { gte: mensual.from, lte: mensual.to } },
    });
    assert.equal(mensual.totalCents, verified.reduce((a, i) => a + i.amountCents, 0n));
  });

  console.log("Permisos y aislamiento");
  const ana = await byName("Ana Gómez");
  const bruno = await byName("Bruno Díaz");
  const elena = await byName("Elena Paz");
  const clienteA = await asCurrentUser("cliente.a@contadorsmart.local");
  const clienteB = await asCurrentUser("cliente.b@contadorsmart.local");
  const admin = await asCurrentUser("admin@contadorsmart.local");
  const otherAdmin = await asCurrentUser("admin.otro@contadorsmart.local");

  await check("cliente A ve solo a Ana y Martín", async () => {
    const names = (await getAccessibleTaxpayers(clienteA)).map((t) => t.name).sort();
    assert.deepEqual(names, ["Ana Gómez", "Martín Gómez"]);
  });
  await check("cliente A no puede abrir a Bruno por ID", async () => {
    assert.equal(await getAuthorizedTaxpayer(clienteA, bruno.id), null);
  });
  await check("cliente B no puede abrir a Ana por ID", async () => {
    assert.equal(await getAuthorizedTaxpayer(clienteB, ana.id), null);
  });
  await check("un acceso PENDIENTE no habilita (cliente B → Elena)", async () => {
    assert.equal(await getAuthorizedTaxpayer(clienteB, elena.id), null);
  });
  await check("el admin del estudio ve a todos los de su estudio", async () => {
    assert.equal((await getAccessibleTaxpayers(admin)).length, 6);
  });
  await check("el admin de otro estudio no ve a Ana", async () => {
    assert.equal(await getAuthorizedTaxpayer(otherAdmin, ana.id), null);
    assert.ok((await getAccessibleTaxpayers(otherAdmin)).every((t) => t.studyId === otherAdmin.studyId));
  });

  console.log("Login");
  await check("contraseña de demo válida e inválida", async () => {
    const u = await prisma.user.findUniqueOrThrow({ where: { email: "cliente.a@contadorsmart.local" } });
    assert.equal(await compare("Demo1234!", u.passwordHash), true);
    assert.equal(await compare("otra", u.passwordHash), false);
    assert.notEqual(u.passwordHash, "Demo1234!");
  });

  console.log(`\n${passed} verificaciones OK`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

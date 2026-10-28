// Verificaciones rápidas sin servidor: `npm run verify`.
// Corre sobre una base aparte recién sembrada (scripts/verify.mjs), nunca sobre la de `npm run dev`.
import assert from "node:assert/strict";
import { compare } from "bcryptjs";
import { prisma } from "@/lib/db";
import { formatARS, parseAmountToCents } from "@/lib/money";
import { todayAR } from "@/lib/dates";
import type { CurrentUser } from "@/lib/auth";
import { alertLevel, getDashboardData, periodRanges } from "@/modules/dashboard/metrics";
import { getAccessibleTaxpayers, getAuthorizedTaxpayer } from "@/modules/taxpayers/access";
import { isValidCuit, normalizeCuit } from "@/lib/cuit";
import { passwordProblem } from "@/lib/crypto";
import { TOKEN_TYPE } from "@/lib/constants";
import { isTokenUsable, registerUser, requestPasswordReset, resetPassword, verifyEmail } from "@/modules/auth/service";
import { approveRequest, rejectRequest, requestAssociation, revokeAccess, setUserActive } from "@/modules/access/service";
import { changePassword } from "@/modules/profile/service";

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
  await check("una solicitud PENDIENTE no habilita (cliente B → Elena)", async () => {
    assert.equal(await prisma.accessRequest.count({ where: { userId: clienteB.id, status: "PENDIENTE" } }), 1);
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

  console.log("CUIT");
  await check("validación formal con dígito verificador", () => {
    assert.equal(isValidCuit(normalizeCuit("20-12345678-6")), true);
    assert.equal(isValidCuit("27000000014"), true);
    assert.equal(isValidCuit("20123456787"), false); // dígito incorrecto
    assert.equal(isValidCuit("99123456786"), false); // prefijo inexistente
    assert.equal(isValidCuit("2012345678"), false); // 10 dígitos
  });

  console.log("Alta, verificación y recuperación");
  const origin = "http://localhost:3000";
  const newEmail = "nuevo.cliente@contadorsmart.local";
  const lastLink = async (to: string, path: string) => {
    const m = await prisma.outboxEmail.findFirstOrThrow({ where: { to }, orderBy: { createdAt: "desc" } });
    const match = m.body.match(new RegExp(`${path}\\?token=([\\w-]+)`));
    assert.ok(match, `no hay enlace ${path} en el correo`);
    return match[1];
  };

  await check("registro crea un cliente sin verificar y manda el correo", async () => {
    const r = await registerUser({ name: "Nuevo Cliente", email: newEmail, phone: "+54 11 5555-0000", password: "Clave1234" }, origin);
    assert.equal(r.ok, true);
    const u = await prisma.user.findUniqueOrThrow({ where: { email: newEmail } });
    assert.equal(u.role, "CLIENTE");
    assert.equal(u.emailVerifiedAt, null);
    assert.notEqual(u.passwordHash, "Clave1234");
  });
  await check("registrarse con un correo existente no crea otro usuario ni lo revela", async () => {
    const before = await prisma.user.count();
    const r = await registerUser({ name: "X", email: "cliente.a@contadorsmart.local", phone: "+54 11 5555-0001", password: "Clave1234" }, origin);
    assert.equal(r.ok, true); // misma respuesta que un alta nueva
    assert.equal(await prisma.user.count(), before);
  });
  await check("el enlace de verificación sirve una sola vez", async () => {
    const token = await lastLink(newEmail, "/verificar");
    assert.equal(await verifyEmail("token-inventado"), false);
    assert.equal(await verifyEmail(token), true);
    assert.equal(await verifyEmail(token), false);
    const u = await prisma.user.findUniqueOrThrow({ where: { email: newEmail } });
    assert.ok(u.emailVerifiedAt);
  });
  await check("recuperación: token de un uso, cambia la clave y cierra sesiones", async () => {
    const u = await prisma.user.findUniqueOrThrow({ where: { email: newEmail } });
    await prisma.session.create({ data: { userId: u.id, tokenHash: "sesion-de-prueba", expiresAt: new Date(Date.now() + 60_000) } });
    await requestPasswordReset(newEmail, origin);
    const token = await lastLink(newEmail, "/restablecer");
    assert.equal(await isTokenUsable(token, TOKEN_TYPE.RESTABLECER_CLAVE), true);
    assert.equal(await isTokenUsable(token, TOKEN_TYPE.VERIFICAR_CORREO), false); // no sirve para otra cosa
    assert.equal(await resetPassword(token, "OtraClave99"), true);
    assert.equal(await resetPassword(token, "OtraClave99"), false);
    const after = await prisma.user.findUniqueOrThrow({ where: { email: newEmail } });
    assert.equal(await compare("OtraClave99", after.passwordHash), true);
    assert.equal(await prisma.session.count({ where: { userId: u.id } }), 0);
  });
  await check("pedir recuperación de un correo inexistente no manda nada", async () => {
    const before = await prisma.outboxEmail.count();
    await requestPasswordReset("nadie@contadorsmart.local", origin);
    assert.equal(await prisma.outboxEmail.count(), before);
  });

  console.log("Asociación por CUIT, aprobación y revocación");
  const nuevo = await asCurrentUser(newEmail);
  await check("asociarse al CUIT de un cliente existente no da acceso ni datos", async () => {
    const r = await requestAssociation(nuevo, { cuit: "27-00000001-4", name: "Ana", activity: "Diseño", category: "", startDate: "2024-01-01" });
    assert.equal(r.ok, true);
    assert.equal(await getAuthorizedTaxpayer(nuevo, ana.id), null);
    assert.equal((await getAccessibleTaxpayers(nuevo)).length, 0);
  });
  await check("CUIT inválido y solicitud duplicada se rechazan", async () => {
    const bad = await requestAssociation(nuevo, { cuit: "20123456787", name: "X", activity: "Y", category: "", startDate: "2024-01-01" });
    assert.equal(bad.ok, false);
    const dup = await requestAssociation(nuevo, { cuit: "27000000014", name: "Ana", activity: "Diseño", category: "", startDate: "2024-01-01" });
    assert.equal(dup.ok, false);
  });
  await check("un cliente no puede aprobar solicitudes", async () => {
    const req = await prisma.accessRequest.findFirstOrThrow({ where: { userId: nuevo.id } });
    await assert.rejects(() => approveRequest(nuevo, req.id, "", ""));
  });
  await check("el admin de otro estudio no puede aprobarla", async () => {
    const req = await prisma.accessRequest.findFirstOrThrow({ where: { userId: nuevo.id } });
    const r = await approveRequest(otherAdmin, req.id, "", "");
    assert.equal(r.ok, false);
  });
  await check("aprobación del estudio habilita el acceso (y no se aprueba dos veces)", async () => {
    const req = await prisma.accessRequest.findFirstOrThrow({ where: { userId: nuevo.id } });
    assert.equal((await approveRequest(admin, req.id, "", "Verificado por teléfono")).ok, true);
    assert.ok(await getAuthorizedTaxpayer(nuevo, ana.id));
    assert.equal((await approveRequest(admin, req.id, "", "")).ok, false);
  });
  await check("aprobar un CUIT nuevo crea el contribuyente sin datos (información incompleta)", async () => {
    const r = await requestAssociation(nuevo, { cuit: "20123456786", name: "Nuevo Monotributo", activity: "Programación", category: "C", startDate: "2025-03-01" });
    assert.equal(r.ok, true);
    const req = await prisma.accessRequest.findFirstOrThrow({ where: { userId: nuevo.id, cuit: "20123456786" } });
    assert.equal((await approveRequest(admin, req.id, "C", "")).ok, true);
    const tp = await prisma.taxpayer.findFirstOrThrow({ where: { cuit: "20123456786", studyId: admin.studyId } });
    assert.equal(tp.categoryCode, "C");
    const data = await getDashboardData(tp, today);
    assert.equal(data.periods[0].totalCents, null);
    assert.equal(data.margin.available, false);
  });
  await check("rechazo exige motivo y no da acceso", async () => {
    const req = await prisma.accessRequest.findFirstOrThrow({ where: { userId: clienteB.id, status: "PENDIENTE" } });
    assert.equal((await rejectRequest(admin, req.id, "")).ok, false);
    assert.equal((await rejectRequest(admin, req.id, "No es titular del CUIT")).ok, true);
    assert.equal(await getAuthorizedTaxpayer(clienteB, elena.id), null);
  });
  await check("revocar corta el acceso en la siguiente consulta", async () => {
    const access = await prisma.taxpayerAccess.findFirstOrThrow({ where: { userId: nuevo.id, taxpayerId: ana.id } });
    assert.equal((await revokeAccess(admin, access.id, "")).ok, false);
    assert.equal((await revokeAccess(otherAdmin, access.id, "Prueba")).ok, false);
    assert.equal((await revokeAccess(admin, access.id, "Ya no es cliente")).ok, true);
    assert.equal(await getAuthorizedTaxpayer(nuevo, ana.id), null);
  });
  await check("suspender cierra sesiones; no se puede suspender a uno mismo", async () => {
    await prisma.session.create({ data: { userId: nuevo.id, tokenHash: "otra-sesion", expiresAt: new Date(Date.now() + 60_000) } });
    assert.equal((await setUserActive(admin, admin.id, false)).ok, false);
    assert.equal((await setUserActive(otherAdmin, nuevo.id, false)).ok, false);
    assert.equal((await setUserActive(admin, nuevo.id, false)).ok, true);
    assert.equal(await prisma.session.count({ where: { userId: nuevo.id } }), 0);
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: nuevo.id } })).active, false);
    assert.equal((await setUserActive(admin, nuevo.id, true)).ok, true);
  });

  console.log("Perfil");
  await check("cambiar contraseña exige la actual y cierra sesiones", async () => {
    assert.equal((await changePassword(nuevo, "incorrecta", "Nueva12345", "Nueva12345")).ok, false);
    assert.equal((await changePassword(nuevo, "OtraClave99", "corta", "corta")).ok, false);
    await prisma.session.create({ data: { userId: nuevo.id, tokenHash: "sesion-3", expiresAt: new Date(Date.now() + 60_000) } });
    assert.equal((await changePassword(nuevo, "OtraClave99", "Nueva12345", "Nueva12345")).ok, true);
    assert.equal(await prisma.session.count({ where: { userId: nuevo.id } }), 0);
  });
  await check("política de contraseñas", () => {
    assert.ok(passwordProblem("corta1"));
    assert.ok(passwordProblem("sinnumeros"));
    assert.ok(passwordProblem("12345678"));
    assert.equal(passwordProblem("Clave1234"), null);
  });

  console.log(`\n${passed} verificaciones OK`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

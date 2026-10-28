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
import { addDaysYmd } from "@/lib/dates";
import { lineSubtotalCents, parseQuantityMilli } from "@/lib/money";
import {
  deleteDraft,
  duplicateAsDraft,
  emitInvoice,
  getAuthorizedInvoice,
  saveDraft,
  type DraftInput,
} from "@/modules/billing/service";
import { buildInvoicePdf } from "@/modules/billing/pdf";
import { COUNTED_INVOICE_STATUSES } from "@/lib/constants";
import { computeMargin, getInvoices, suggestCategory, type PeriodMetric, type ScaleInfo } from "@/modules/dashboard/metrics";
import { createScaleVersion, findScaleForDate, listScales, type ScaleInput } from "@/modules/fiscal/scales";
import { getCategoryAt, setCategory } from "@/modules/fiscal/category";
import { createObligation, getDebtSummary, updateObligationStatus } from "@/modules/fiscal/obligations";

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

  console.log("Facturador (modo demo)");
  await check("cantidades y subtotales exactos", () => {
    assert.equal(parseQuantityMilli("1,5"), 1500);
    assert.equal(parseQuantityMilli("2.255"), 2255);
    assert.equal(parseQuantityMilli("1,2345"), null);
    assert.equal(parseQuantityMilli("-1"), null);
    assert.equal(lineSubtotalCents(1500, 33333n), 50000n); // 1,5 × 333,33 = 499,995 → 500,00
    assert.equal(lineSubtotalCents(3000, 10n), 30n);
  });

  const draftInput = (over: Partial<DraftInput> = {}): DraftInput => ({
    issueDate: today,
    recipientMode: "nuevo",
    recipientId: "",
    recipientName: "Cliente de Prueba SRL",
    docType: "CUIT",
    docNumber: "20-12345678-6",
    taxCondition: "RESPONSABLE_INSCRIPTO",
    saveRecipient: true,
    items: [
      { description: "Diseño de logo", quantity: "1", unitPrice: "150.000,50" },
      { description: "Horas de ajuste", quantity: "2,5", unitPrice: "10000" },
    ],
    ...over,
  });

  let draftId = "";
  await check("guardar borrador: el servidor calcula el total y guarda el receptor", async () => {
    const r = await saveDraft(clienteA, ana.id, draftInput());
    assert.equal(r.ok, true);
    draftId = (r as { invoiceId: string }).invoiceId;
    const inv = await prisma.invoice.findUniqueOrThrow({ where: { id: draftId }, include: { items: true } });
    assert.equal(inv.amountCents, 17500050n); // 150.000,50 + 25.000,00
    assert.equal(inv.status, "BORRADOR");
    assert.equal(inv.items.length, 2);
    assert.equal(inv.recipientDocNumber, "20123456786");
    assert.equal(await prisma.invoiceRecipient.count({ where: { taxpayerId: ana.id, name: "Cliente de Prueba SRL" } }), 1);
  });
  await check("validaciones del borrador", async () => {
    const future = await saveDraft(clienteA, ana.id, draftInput({ issueDate: "2999-01-01" }));
    assert.equal(future.ok, false);
    const old = await saveDraft(clienteA, ana.id, draftInput({ issueDate: addDaysYmd(today, -11) }));
    assert.equal(old.ok, false);
    const badCuit = await saveDraft(clienteA, ana.id, draftInput({ docNumber: "20123456787" }));
    assert.ok(!badCuit.ok && badCuit.fieldErrors?.docNumber);
    const ri = await saveDraft(clienteA, ana.id, draftInput({ docType: "DNI", docNumber: "12345678" }));
    assert.ok(!ri.ok && ri.fieldErrors?.docType); // RI necesita CUIT
    const noItems = await saveDraft(clienteA, ana.id, draftInput({ items: [{ description: "", quantity: "", unitPrice: "" }] }));
    assert.ok(!noItems.ok && noItems.fieldErrors?.items);
    const badRow = await saveDraft(clienteA, ana.id, draftInput({ items: [{ description: "", quantity: "", unitPrice: "" }, { description: "X", quantity: "0", unitPrice: "abc" }] }));
    assert.ok(!badRow.ok && badRow.fieldErrors?.["item-1-quantity"] && badRow.fieldErrors?.["item-1-price"]);
  });
  await check("otro cliente no puede ver ni facturar para Ana", async () => {
    assert.equal(await getAuthorizedInvoice(clienteB, draftId), null);
    assert.equal((await saveDraft(clienteB, ana.id, draftInput())).ok, false);
    assert.equal((await emitInvoice(clienteB, draftId, "clave-ajena-123", false)).ok, false);
    assert.equal(await getAuthorizedInvoice(otherAdmin, draftId), null);
  });

  const mensualAna = async () => (await getDashboardData(ana, today)).periods.find((p) => p.key === "mensual")!.totalCents!;
  const before = await mensualAna();

  await check("doble clic: dos emisiones simultáneas con la misma clave dan un solo comprobante", async () => {
    const key = "doble-clic-0001";
    const [a, b] = await Promise.all([emitInvoice(clienteA, draftId, key, false), emitInvoice(clienteA, draftId, key, false)]);
    assert.ok(a.ok || b.ok, `${a.message} / ${b.message}`);
    const inv = await prisma.invoice.findUniqueOrThrow({ where: { id: draftId } });
    assert.equal(inv.status, "SIMULADO");
    assert.equal(inv.number, 1);
    assert.equal(await prisma.invoiceAttempt.count({ where: { invoiceId: draftId } }), 1);
    // Reintento con la misma clave: mismo resultado, sin numerar de nuevo.
    const again = await emitInvoice(clienteA, draftId, key, false);
    assert.equal(again.ok, true);
    assert.match(again.message, /C 00001-00000001/);
  });
  await check("misma clave con otro pedido → conflicto; otra clave → no reemite", async () => {
    const conflict = await emitInvoice(clienteA, draftId, "doble-clic-0001", true);
    assert.equal(conflict.ok, false);
    const otherKey = await emitInvoice(clienteA, draftId, "otra-clave-0002", false);
    assert.equal(otherKey.ok, false);
    assert.equal((await prisma.invoice.findUniqueOrThrow({ where: { id: draftId } })).number, 1);
  });
  await check("la factura simulada suma en el tablero de la demo", async () => {
    assert.equal(await mensualAna(), before + 17500050n);
  });
  await check("la numeración sigue en orden", async () => {
    const r = await saveDraft(clienteA, ana.id, draftInput({ recipientName: "Segundo Cliente", saveRecipient: false }));
    const id2 = (r as { invoiceId: string }).invoiceId;
    assert.equal((await emitInvoice(clienteA, id2, "segunda-0001", false)).ok, true);
    assert.equal((await prisma.invoice.findUniqueOrThrow({ where: { id: id2 } })).number, 2);
  });
  await check("un rechazo no suma en los totales ni consume número", async () => {
    const totalBefore = await mensualAna();
    const r = await saveDraft(clienteA, ana.id, draftInput({ saveRecipient: false }));
    const id3 = (r as { invoiceId: string }).invoiceId;
    const res = await emitInvoice(clienteA, id3, "rechazo-0001", true);
    assert.equal(res.ok, false);
    const inv = await prisma.invoice.findUniqueOrThrow({ where: { id: id3 } });
    assert.equal(inv.status, "RECHAZADO");
    assert.equal(inv.number, null);
    assert.equal(await mensualAna(), totalBefore);
    // Se puede copiar a un borrador nuevo para corregir.
    const copy = await duplicateAsDraft(clienteA, id3);
    assert.equal(copy.ok, true);
  });
  await check("solo se editan y eliminan borradores", async () => {
    assert.equal((await saveDraft(clienteA, ana.id, draftInput(), draftId)).ok, false);
    assert.equal((await deleteDraft(clienteA, draftId)).ok, false);
    const r = await saveDraft(clienteA, ana.id, draftInput({ saveRecipient: false }));
    const id4 = (r as { invoiceId: string }).invoiceId;
    assert.equal((await saveDraft(clienteA, ana.id, draftInput({ saveRecipient: false, items: [{ description: "Editado", quantity: "1", unitPrice: "100" }] }), id4)).ok, true);
    assert.equal((await prisma.invoice.findUniqueOrThrow({ where: { id: id4 } })).amountCents, 10000n);
    assert.equal((await deleteDraft(clienteA, id4)).ok, true);
  });
  await check("PDF de prueba se genera", async () => {
    const inv = await getAuthorizedInvoice(clienteA, draftId);
    const bytes = await buildInvoicePdf(inv!);
    assert.equal(Buffer.from(bytes.slice(0, 5)).toString(), "%PDF-");
    assert.ok(bytes.length > 1500);
  });
  await check("al revocar el acceso, la factura deja de estar disponible", async () => {
    const access = await prisma.taxpayerAccess.findFirstOrThrow({ where: { userId: clienteA.id, taxpayerId: ana.id } });
    await revokeAccess(admin, access.id, "Prueba de revocación");
    assert.equal(await getAuthorizedInvoice(clienteA, draftId), null);
    await prisma.taxpayerAccess.update({ where: { id: access.id }, data: { status: "APROBADO" } });
  });

  console.log("Escalas y categorías");
  const year = Number(today.slice(0, 4));
  const elenaTp = await byName("Elena Paz");
  const carla = await byName("Carla Ruiz");
  const martin = await byName("Martín Gómez");

  await check("cada estudio ve solo sus escalas", async () => {
    const mine = await listScales(admin.studyId);
    const others = await listScales(otherAdmin.studyId);
    assert.equal(mine.length, 2);
    assert.ok(mine.every((s) => s.studyId === admin.studyId));
    assert.ok(others.every((s) => s.studyId === otherAdmin.studyId));
  });
  await check("la escala aplicada depende de la fecha de corte (borde de año)", async () => {
    assert.equal((await findScaleForDate(admin.studyId, `${year}-01-01`))!.name, `Escala ficticia ${year}`);
    assert.equal((await findScaleForDate(admin.studyId, `${year - 1}-12-31`))!.name, `Escala ficticia ${year - 1}`);
    assert.equal(await findScaleForDate(admin.studyId, "2019-12-31"), null);
  });
  const scaleInput = (over: Partial<ScaleInput> = {}): ScaleInput => ({
    name: "Escala de prueba",
    source: "Valores de prueba",
    status: "DEMO",
    validFrom: `${year + 1}-01-01`,
    validTo: "",
    limits: { A: "1000", B: "2000", C: "3000" },
    ...over,
  });
  await check("escala inválida: límites no crecientes, fecha imposible, validada sin fuente concreta", async () => {
    const r1 = await createScaleVersion(admin, scaleInput({ limits: { A: "2000", B: "1000" } }));
    assert.ok(!r1.ok && r1.fieldErrors?.["limit-B"]);
    const r2 = await createScaleVersion(admin, scaleInput({ status: "VALIDADA", source: "ARCA" }));
    assert.ok(!r2.ok && r2.fieldErrors?.source);
    const r3 = await createScaleVersion(admin, scaleInput({ validFrom: "2026-02-30" }));
    assert.ok(!r3.ok && r3.fieldErrors?.validFrom);
    await assert.rejects(() => createScaleVersion(clienteA, scaleInput()));
  });
  await check("una versión nueva cierra la vigente y no se permiten superposiciones", async () => {
    const created = await createScaleVersion(admin, scaleInput());
    assert.equal(created.ok, true);
    const current = await findScaleForDate(admin.studyId, today);
    assert.equal(current!.validTo, `${year}-12-31`);
    const clash = await createScaleVersion(admin, scaleInput({ validFrom: `${year}-06-01`, validTo: `${year}-07-01` }));
    assert.ok(!clash.ok && clash.fieldErrors?.validFrom);
    // El otro estudio no se entera.
    assert.equal((await listScales(otherAdmin.studyId)).length, 2);
    assert.equal((await findScaleForDate(otherAdmin.studyId, today))!.validTo, null);
  });

  const fakeRolling = (totalCents: bigint | null, coverage: PeriodMetric["coverage"] = "COMPLETA"): PeriodMetric => ({
    key: "movil12",
    label: "Últimos 12 meses",
    description: "",
    from: "2025-11-01",
    to: "2026-10-28",
    totalCents,
    invoiceCount: 0,
    coverage,
  });
  const fakeScale: ScaleInfo = {
    id: "x",
    name: "Prueba",
    status: "DEMO",
    source: "Prueba",
    validFrom: "2020-01-01",
    validTo: null,
    limits: [
      { code: "A", annualLimitCents: 800_000_000n },
      { code: "B", annualLimitCents: 1_200_000_000n },
      { code: "C", annualLimitCents: 1_700_000_000n },
    ],
  };
  await check("margen firmado: el exceso se ve con su valor real", () => {
    const m = computeMargin("A", "2020-01-01", fakeRolling(900_000_000n), fakeScale);
    assert.ok(m.available);
    assert.equal(m.marginCents, -100_000_000n);
    assert.equal(m.percentTenths, 1125);
    assert.equal(m.level, "SUPERADO");
  });
  await check("escala ausente, categoría sin límite o datos parciales → sin margen", () => {
    assert.equal(computeMargin("A", "2020-01-01", fakeRolling(1n), null).available, false);
    assert.equal(computeMargin("K", "2020-01-01", fakeRolling(1n), fakeScale).available, false);
    assert.equal(computeMargin("A", "2020-01-01", fakeRolling(1n, "PARCIAL"), fakeScale).available, false);
    assert.equal(computeMargin(null, "2020-01-01", fakeRolling(1n), fakeScale).available, false);
  });
  await check("categoría orientativa por ingresos y sus casos insuficientes", () => {
    assert.deepEqual(suggestCategory("2020-01-01", fakeRolling(1_200_000_000n), fakeScale), { available: true, code: "B", aboveTop: false });
    assert.deepEqual(suggestCategory("2020-01-01", fakeRolling(1_200_000_001n), fakeScale), { available: true, code: "C", aboveTop: false });
    assert.deepEqual(suggestCategory("2020-01-01", fakeRolling(2_000_000_000n), fakeScale), { available: true, code: null, aboveTop: true });
    assert.equal(suggestCategory("2026-03-01", fakeRolling(1n), fakeScale).available, false); // actividad reciente
    assert.equal(suggestCategory("2020-01-01", fakeRolling(null, "SIN_DATOS"), fakeScale).available, false);
    assert.equal(suggestCategory("2020-01-01", fakeRolling(1n), null).available, false);
  });
  await check("la categoría registrada no cambia sola aunque se supere el límite", async () => {
    const data = await getDashboardData(bruno, today);
    assert.ok(data.margin.available && data.margin.level === "SUPERADO");
    assert.ok(data.category.suggestion.available && data.category.suggestion.code !== "C");
    assert.equal((await byName("Bruno Díaz")).categoryCode, "C");
  });
  await check("historial: la categoría de cada fecha (Elena E → F)", async () => {
    assert.equal((await getCategoryAt(elenaTp, today)).code, "F");
    const sevenMonthsAgo = new Date(Date.UTC(year, Number(today.slice(5, 7)) - 1 - 7, 15)).toISOString().slice(0, 10);
    assert.equal((await getCategoryAt(elenaTp, sevenMonthsAgo)).code, "E");
  });
  await check("registrar categoría: valida, guarda historial y actualiza la actual", async () => {
    assert.ok(!(await setCategory(admin, carla.id, "Z", today, "Prueba")).ok);
    assert.ok(!(await setCategory(admin, carla.id, "B", addDaysYmd(today, 1), "Prueba")).ok);
    assert.ok(!(await setCategory(admin, carla.id, "B", today, "")).ok);
    assert.ok(!(await setCategory(otherAdmin, carla.id, "B", today, "Prueba")).ok);
    await assert.rejects(() => setCategory(clienteA, carla.id, "B", today, "Prueba"));
    const r = await setCategory(admin, carla.id, "B", today, "Recategorización de prueba");
    assert.ok(r.ok, r.message);
    assert.equal((await byName("Carla Ruiz")).categoryCode, "B");
    assert.equal((await getCategoryAt(carla, addDaysYmd(today, -1))).code, "A");
    assert.ok(!(await setCategory(admin, carla.id, "B", today, "Otra vez")).ok);
  });

  console.log("Fechas límite y conciliación");
  await check("períodos a ambos lados del cambio de año y año bisiesto", () => {
    assert.deepEqual(periodRanges("2026-12-31").anual, { from: "2026-01-01", to: "2026-12-31" });
    assert.deepEqual(periodRanges("2027-01-01").mensual, { from: "2027-01-01", to: "2027-01-01" });
    assert.equal(periodRanges("2027-01-01").movil12.from, "2026-02-01");
    assert.equal(periodRanges("2027-01-01").semestral.from, "2027-01-01");
    assert.equal(periodRanges("2028-02-29").movil12.from, "2027-03-01");
  });
  for (const tp of [ana, bruno, martin]) {
    await check(`cada total del tablero coincide con sus movimientos (${tp.name})`, async () => {
      const data = await getDashboardData(tp, today);
      for (const period of data.periods) {
        const rows = (await getInvoices(tp.id, period.from, period.to)).filter((i) => COUNTED_INVOICE_STATUSES.includes(i.status));
        assert.equal(period.totalCents, rows.reduce((a, i) => a + i.amountCents, 0n), period.key);
        assert.equal(period.invoiceCount, rows.length, period.key);
      }
      const chartTotal = data.chart.reduce((a, b) => a + b.totalCents, 0n);
      assert.equal(chartTotal, data.periods.find((p) => p.key === "movil12")!.totalCents);
    });
  }

  console.log("Deudas y vencimientos");
  await check("sin revisión ni datos → No disponible, nunca 'sin deuda'", async () => {
    assert.equal((await getDebtSummary(martin.id, today)).state, "SIN_DATOS");
  });
  await check("deuda informada: suma solo vencidas con importe; las próximas no suman", async () => {
    const d = await getDebtSummary(bruno.id, today);
    assert.equal(d.state, "DEUDA_INFORMADA");
    assert.equal(d.overdue.length, 3);
    assert.equal(d.overdueTotalCents, 9_780_000n);
    assert.equal(d.overdueWithoutAmount, 1);
    assert.equal(d.upcoming.length, 1);
  });
  await check("revisada sin vencimientos → sin deuda informada; pago informado → pendiente de revisión", async () => {
    assert.equal((await getDebtSummary(ana.id, today)).state, "SIN_DEUDA_INFORMADA");
    assert.equal((await getDebtSummary(carla.id, today)).state, "SIN_DEUDA_INFORMADA");
    assert.equal((await getDebtSummary(elenaTp.id, today)).state, "PENDIENTE_REVISION");
  });
  await check("un vencimiento de hoy no es deuda vencida; al día siguiente sí", async () => {
    const due = (await getDebtSummary(ana.id, today)).upcoming[0].dueDate;
    assert.equal((await getDebtSummary(ana.id, due)).overdue.length, 0);
    assert.equal((await getDebtSummary(ana.id, addDaysYmd(due, 1))).overdue.length, 1);
  });
  await check("cargar vencimientos: validaciones y aislamiento", async () => {
    const bad = await createObligation(admin, martin.id, { concept: "X", period: "2026-13", dueDate: "2026-02-30", amount: "-5" });
    assert.ok(!bad.ok && bad.fieldErrors?.period && bad.fieldErrors?.dueDate && bad.fieldErrors?.amount && bad.fieldErrors?.concept);
    const input = { concept: "Cuota mensual", period: today.slice(0, 7), dueDate: addDaysYmd(today, -1), amount: "" };
    assert.ok(!(await createObligation(otherAdmin, martin.id, input)).ok);
    await assert.rejects(() => createObligation(clienteA, martin.id, input));
    assert.ok((await createObligation(admin, martin.id, input)).ok);
    // Hay un vencimiento pero ninguna revisión: queda pendiente de revisión, no "sin deuda".
    assert.equal((await getDebtSummary(martin.id, today)).state, "PENDIENTE_REVISION");
  });
  await check("verificar un pago exige evidencia y lo saca de la deuda", async () => {
    const target = (await getDebtSummary(bruno.id, today)).overdue[0];
    assert.ok(!(await updateObligationStatus(admin, target.id, "PAGO_VERIFICADO", "")).ok);
    assert.ok(!(await updateObligationStatus(otherAdmin, target.id, "PAGO_VERIFICADO", "Comprobante")).ok);
    assert.ok((await updateObligationStatus(admin, target.id, "PAGO_VERIFICADO", "Comprobante revisado")).ok);
    const d = await getDebtSummary(bruno.id, today);
    assert.equal(d.overdue.length, 2);
    assert.equal(d.overdueTotalCents, 4_890_000n);
  });

  console.log(`\n${passed} verificaciones OK`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

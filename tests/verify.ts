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
import { createHash } from "node:crypto";
import { passwordVersion, readSession, signSession } from "@/lib/signed-session";
import { MAX_FILE_BYTES } from "@/lib/constants";
import { LocalFileStorage, storageDir } from "@/providers/storage";
import {
  checkFile,
  checkFiles,
  cleanFileName,
  getAuthorizedDocument,
  listDocuments,
  readDocumentBytes,
  setDocumentVisibility,
  storeFiles,
  uploadTaxpayerDocuments,
  type UploadFile,
} from "@/modules/documents/service";
import {
  addMessage,
  createRequest,
  getRequestForUser,
  informPayment,
  listInbox,
  listRequestsForUser,
  updateRequest,
} from "@/modules/requests/service";

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
  await check("una versión con fecha de fin no cierra la vigente (no deja días sin escala)", async () => {
    const r = await createScaleVersion(admin, scaleInput({ validFrom: `${year}-03-01`, validTo: `${year}-04-01` }));
    assert.ok(!r.ok && r.fieldErrors?.validFrom?.includes("dejá vacía la fecha de fin"));
    assert.equal((await findScaleForDate(admin.studyId, today))!.validTo, null);
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

  console.log("Archivos");
  const pdfBytes = (text = "demo") => new TextEncoder().encode(`%PDF-1.4\n% ${text}\n%%EOF\n`);
  const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  const pdfFile = (name = "comprobante.pdf", text?: string): UploadFile => ({ name, type: "application/pdf", bytes: pdfBytes(text) });

  await check("se aceptan PDF, PNG y JPG válidos", () => {
    assert.ok(checkFile(pdfFile()).ok);
    assert.ok(checkFile({ name: "foto.png", type: "image/png", bytes: pngBytes }).ok);
    assert.ok(checkFile({ name: "foto.JPG", type: "", bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2]) }).ok);
  });
  await check("se rechazan HTML disfrazado, tipo o extensión que no coinciden, vacío y más de 10 MB", () => {
    const html = new TextEncoder().encode("<html><script>alert(1)</script></html>");
    assert.ok(!checkFile({ name: "factura.pdf", type: "application/pdf", bytes: html }).ok);
    assert.ok(!checkFile({ name: "pagina.html", type: "text/html", bytes: html }).ok);
    assert.ok(!checkFile({ name: "foto.pdf", type: "application/pdf", bytes: pngBytes }).ok);
    assert.ok(!checkFile({ name: "comprobante.pdf", type: "text/html", bytes: pdfBytes() }).ok);
    assert.ok(!checkFile({ name: "vacio.pdf", type: "application/pdf", bytes: new Uint8Array() }).ok);
    const big = new Uint8Array(MAX_FILE_BYTES + 1);
    big.set(pdfBytes());
    assert.ok(!checkFile({ name: "grande.pdf", type: "application/pdf", bytes: big }).ok);
    assert.ok(!checkFiles([pdfFile(), pdfFile(), pdfFile(), pdfFile()]).ok);
    assert.equal(cleanFileName("..\\..\\C:/temp/<x>.pdf"), "x.pdf");
  });
  await check("los archivos sobreviven a un reinicio (otra instancia lee lo mismo) y la clave no sale de la carpeta", async () => {
    const checked = checkFile(pdfFile("x.pdf", "persistencia"));
    assert.ok(checked.ok);
    const [stored] = await storeFiles([checked.file]);
    const again = new LocalFileStorage(storageDir);
    const bytes = await again.get(stored.storageKey);
    assert.ok(bytes && Buffer.from(bytes).equals(Buffer.from(pdfBytes("persistencia"))));
    assert.equal(createHash("sha256").update(bytes!).digest("hex"), stored.sha256);
    await assert.rejects(() => again.get("../../prisma/verify"));
    await again.remove(stored.storageKey);
    assert.equal(await again.get(stored.storageKey), null);
  });

  console.log("Solicitudes, notas internas y documentos");
  const contadora = await asCurrentUser("contadora@contadorsmart.local");
  const SECRET = "NOTA-INTERNA-NO-VISIBLE-123";
  let requestId = "";
  await check("crear solicitud: validaciones y solo para contribuyentes habilitados", async () => {
    const bad = await createRequest(clienteB, { taxpayerId: bruno.id, topic: "PAGO", subject: "x", body: "" }, [], origin);
    assert.ok(!bad.ok && bad.fieldErrors?.topic && bad.fieldErrors?.subject && bad.fieldErrors?.body);
    const foreign = await createRequest(clienteB, { taxpayerId: ana.id, topic: "OTRO", subject: "Consulta", body: "Hola" }, [], origin);
    assert.ok(!foreign.ok && foreign.fieldErrors?.taxpayerId);
    const html = { name: "a.pdf", type: "application/pdf", bytes: new TextEncoder().encode("<html>") };
    const badFile = await createRequest(clienteB, { taxpayerId: bruno.id, topic: "OTRO", subject: "Consulta", body: "Hola" }, [html], origin);
    assert.ok(!badFile.ok && badFile.fieldErrors?.files);
  });
  await check("recorrido cliente → estudio → cliente", async () => {
    const before = await prisma.document.count();
    const created = await createRequest(
      clienteB,
      { taxpayerId: bruno.id, topic: "FACTURACION", subject: "Factura a un cliente del exterior", body: "¿Cómo la hago?" },
      [pdfFile("presupuesto.pdf")],
      origin,
    );
    assert.ok(created.ok, created.message);
    requestId = created.requestId;
    assert.equal(await prisma.document.count(), before + 1);
    // Avisa al estudio.
    assert.ok(await prisma.outboxEmail.findFirst({ where: { to: "admin@contadorsmart.local", subject: { contains: "Factura a un cliente del exterior" } } }));

    // El estudio la ve en su bandeja, la asigna y deja una nota interna con un adjunto interno.
    const inbox = await listInbox(admin, { assigned: "sin" });
    assert.ok(inbox.rows.some((r) => r.id === requestId));
    assert.ok((await updateRequest(admin, requestId, { status: "EN_CURSO", priority: "NORMAL", assignedToId: contadora.id }, origin)).ok);
    assert.ok((await listInbox(contadora, { assigned: "mias" })).rows.some((r) => r.id === requestId));
    const note = await addMessage(contadora, requestId, { body: `Revisar condición frente al IVA. ${SECRET}`, visibility: "INTERNA" }, [pdfFile("interno.pdf")], origin);
    assert.ok(note.ok, note.message);
    const reply = await addMessage(contadora, requestId, { body: "¿Me pasás el CUIT del cliente?", visibility: "PUBLICA", newStatus: "ESPERANDO_CLIENTE" }, [], origin);
    assert.ok(reply.ok, reply.message);

    // El cliente ve la respuesta y el estado, nunca la nota interna ni su adjunto.
    const seen = await getRequestForUser(clienteB, requestId);
    assert.ok(seen);
    assert.equal(seen.status, "ESPERANDO_CLIENTE");
    assert.equal(seen.messages.length, 2);
    assert.ok(seen.messages.every((m) => m.visibility === "PUBLICA"));
    assert.ok(!JSON.stringify(seen).includes(SECRET));
    assert.ok(!JSON.stringify(seen).includes("interno.pdf"));
    const staffView = await getRequestForUser(admin, requestId);
    assert.equal(staffView!.messages.length, 3);

    // El cliente responde: vuelve a "En curso" y avisa a la persona asignada.
    assert.ok((await addMessage(clienteB, requestId, { body: "Es 30-00000007-4", visibility: "PUBLICA" }, [], origin)).ok);
    assert.equal((await getRequestForUser(clienteB, requestId))!.status, "EN_CURSO");
    assert.ok(await prisma.outboxEmail.findFirst({ where: { to: "contadora@contadorsmart.local", subject: { contains: "Nuevo mensaje del cliente" } } }));

    // El estudio la resuelve y el cliente lo ve.
    assert.ok((await updateRequest(contadora, requestId, { status: "RESUELTA", priority: "NORMAL", assignedToId: contadora.id }, origin)).ok);
    assert.equal((await getRequestForUser(clienteB, requestId))!.status, "RESUELTA");
  });
  await check("los correos al cliente no incluyen notas internas ni el texto de los mensajes", async () => {
    const toClient = await prisma.outboxEmail.findMany({ where: { to: "cliente.b@contadorsmart.local" } });
    assert.ok(toClient.some((m) => m.subject.includes("Respuesta del estudio")));
    assert.ok(toClient.every((m) => !m.body.includes(SECRET) && !m.body.includes("CUIT del cliente")));
    assert.ok(!(await prisma.outboxEmail.findFirst({ where: { body: { contains: SECRET } } })));
  });
  await check("el cliente no puede escribir notas internas ni cambiar el estado", async () => {
    const r = await addMessage(clienteB, requestId, { body: "hola", visibility: "INTERNA" }, [], origin);
    assert.equal(r.ok, false);
    await assert.rejects(() => updateRequest(clienteB, requestId, { status: "ABIERTA", priority: "NORMAL", assignedToId: "" }, origin));
    await assert.rejects(() => listInbox(clienteB, {}));
  });
  await check("acceso cruzado a solicitudes: otro cliente y otro estudio son rechazados", async () => {
    assert.equal(await getRequestForUser(clienteA, requestId), null);
    assert.equal((await addMessage(clienteA, requestId, { body: "hola", visibility: "PUBLICA" }, [], origin)).ok, false);
    assert.equal(await getRequestForUser(otherAdmin, requestId), null);
    assert.equal((await updateRequest(otherAdmin, requestId, { status: "ABIERTA", priority: "NORMAL", assignedToId: "" }, origin)).ok, false);
    assert.ok(!(await listRequestsForUser(clienteA, { view: "todas" })).some((r) => r.id === requestId));
  });
  await check("solo se asigna a personal activo del mismo estudio", async () => {
    const bad1 = await updateRequest(admin, requestId, { status: "RESUELTA", priority: "NORMAL", assignedToId: clienteB.id }, origin);
    const bad2 = await updateRequest(admin, requestId, { status: "RESUELTA", priority: "NORMAL", assignedToId: otherAdmin.id }, origin);
    assert.ok(!bad1.ok && bad1.fieldErrors?.assignedToId);
    assert.ok(!bad2.ok && bad2.fieldErrors?.assignedToId);
  });
  await check("documentos: el cliente no descarga internos ni ajenos; otro estudio tampoco", async () => {
    const docs = await prisma.document.findMany({ where: { message: { requestId } }, include: { message: true } });
    const publicDoc = docs.find((d) => d.message!.visibility === "PUBLICA")!;
    const internalDoc = docs.find((d) => d.message!.visibility === "INTERNA")!;
    assert.equal(internalDoc.visibility, "INTERNO");
    assert.ok(await getAuthorizedDocument(clienteB, publicDoc.id));
    assert.equal(await getAuthorizedDocument(clienteB, internalDoc.id), null);
    assert.equal(await getAuthorizedDocument(clienteA, publicDoc.id), null);
    assert.equal(await getAuthorizedDocument(otherAdmin, publicDoc.id), null);
    assert.ok(await getAuthorizedDocument(admin, internalDoc.id));
    const bytes = await readDocumentBytes((await getAuthorizedDocument(clienteB, publicDoc.id))!);
    assert.equal(Buffer.from(bytes!).subarray(0, 5).toString(), "%PDF-");
    // Un adjunto de una nota interna no se puede compartir.
    assert.equal((await setDocumentVisibility(admin, internalDoc.id, "CLIENTE")).ok, false);
    // Interno sembrado de Martín: cliente.a no lo ve ni en la lista ni por URL.
    const martinInternal = await prisma.document.findFirstOrThrow({ where: { taxpayerId: martin.id, visibility: "INTERNO" } });
    assert.equal(await getAuthorizedDocument(clienteA, martinInternal.id), null);
    assert.ok(!(await listDocuments(clienteA, {})).some((d) => d.id === martinInternal.id));
    assert.ok((await listDocuments(admin, {})).some((d) => d.id === martinInternal.id));
  });
  await check("al revocar el acceso, la descarga se rechaza aunque se conserve la URL", async () => {
    const doc = await prisma.document.findFirstOrThrow({ where: { taxpayerId: bruno.id, visibility: "CLIENTE", messageId: null } });
    assert.ok(await getAuthorizedDocument(clienteB, doc.id));
    const access = await prisma.taxpayerAccess.findFirstOrThrow({ where: { userId: clienteB.id, taxpayerId: bruno.id } });
    await revokeAccess(admin, access.id, "Prueba de revocación de documentos");
    assert.equal(await getAuthorizedDocument(clienteB, doc.id), null);
    assert.equal(await getRequestForUser(clienteB, requestId), null);
    await prisma.taxpayerAccess.update({ where: { id: access.id }, data: { status: "APROBADO" } });
  });
  await check("carga del estudio: validaciones, visibilidad y auditoría", async () => {
    const bad = await uploadTaxpayerDocuments(admin, ana.id, [], { category: "X", visibility: "TODOS", note: "" });
    assert.ok(!bad.ok && bad.fieldErrors?.files && bad.fieldErrors?.category && bad.fieldErrors?.visibility);
    assert.ok(!(await uploadTaxpayerDocuments(otherAdmin, ana.id, [pdfFile()], { category: "OTRO", visibility: "CLIENTE", note: "" })).ok);
    await assert.rejects(() => uploadTaxpayerDocuments(clienteA, ana.id, [pdfFile()], { category: "OTRO", visibility: "CLIENTE", note: "" }));
    const ok = await uploadTaxpayerDocuments(admin, ana.id, [pdfFile("interno-ana.pdf")], { category: "OTRO", visibility: "INTERNO", note: "" });
    assert.ok(ok.ok, ok.message);
    const doc = await prisma.document.findFirstOrThrow({ where: { taxpayerId: ana.id, fileName: "interno-ana.pdf" } });
    assert.equal(await getAuthorizedDocument(clienteA, doc.id), null);
    assert.ok((await setDocumentVisibility(admin, doc.id, "CLIENTE")).ok);
    assert.ok(await getAuthorizedDocument(clienteA, doc.id));
    assert.ok(await prisma.auditEvent.findFirst({ where: { action: "DOCUMENT_VISIBILITY", entityId: doc.id } }));
  });
  await check("si el archivo guardado cambia, la descarga se detiene (hash)", async () => {
    const doc = await prisma.document.findFirstOrThrow({ where: { taxpayerId: ana.id, fileName: "interno-ana.pdf" } });
    await assert.rejects(() => readDocumentBytes({ storageKey: doc.storageKey, sha256: "0".repeat(64) }));
  });
  await check("informar un pago: adjunto obligatorio, pasa a 'pago informado' y no se informa dos veces", async () => {
    const target = (await getDebtSummary(bruno.id, today)).overdue[0];
    assert.ok(!(await informPayment(clienteB, target.id, "", [], origin)).ok);
    assert.ok(!(await informPayment(clienteA, target.id, "", [pdfFile()], origin)).ok);
    const r = await informPayment(clienteB, target.id, "Pagué ayer", [pdfFile("pago.pdf")], origin);
    assert.ok(r.ok, r.message);
    const ob = await prisma.obligation.findUniqueOrThrow({ where: { id: target.id } });
    assert.equal(ob.status, "PAGO_INFORMADO");
    const req = await getRequestForUser(admin, r.requestId);
    assert.equal(req!.topic, "PAGO");
    assert.equal(req!.obligation!.id, target.id);
    assert.equal(req!.messages[0].documents.length, 1);
    assert.equal((await prisma.document.findFirstOrThrow({ where: { obligationId: target.id } })).category, "COMPROBANTE_PAGO");
    assert.ok(!(await informPayment(clienteB, target.id, "", [pdfFile()], origin)).ok);
    // Informado no es pagado: sale de la deuda vencida pero el estado queda pendiente de revisión hasta verificarlo.
    const d = await getDebtSummary(bruno.id, today);
    assert.ok(d.paymentInformed.some((o) => o.id === target.id));
  });
  await check("los avisos y servicios aceptan otro canal sin construirlo (campo channel)", async () => {
    const r = await createRequest(clienteA, { taxpayerId: ana.id, topic: "OTRO", subject: "Prueba de canal", body: "Hola", channel: "PRUEBA" }, [], origin);
    assert.ok(r.ok);
    const stored = await prisma.serviceRequest.findUniqueOrThrow({ where: { id: r.requestId }, include: { messages: true } });
    assert.equal(stored.channel, "PRUEBA");
    assert.equal(stored.messages[0].channel, "PRUEBA");
  });
  await check("datos de demo: Bruno con deuda y solicitud nueva sin asignar; Ana con constancia compartida", async () => {
    const brunoOpen = await prisma.serviceRequest.findFirst({ where: { taxpayerId: bruno.id, status: "ABIERTA", assignedToId: null } });
    assert.ok(brunoOpen);
    const constancia = await prisma.document.findFirstOrThrow({ where: { taxpayerId: ana.id, category: "CONSTANCIA" } });
    assert.ok(await getAuthorizedDocument(clienteA, constancia.id));
    const bytes = await readDocumentBytes(constancia);
    assert.equal(Buffer.from(bytes!).subarray(0, 5).toString(), "%PDF-");
  });

  console.log("Sesión firmada (demo en Vercel)");
  await check("la firma valida, rechaza alteraciones, otro secreto y vencimientos", () => {
    const claims = { uid: "u1", exp: Date.now() + 60_000, pwv: passwordVersion("hash-1") };
    const token = signSession(claims, "secreto-a");
    assert.deepEqual(readSession(token, "secreto-a"), claims);
    assert.equal(readSession(token, "secreto-b"), null);
    const [body, mac] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ ...claims, uid: "admin" })).toString("base64url");
    assert.equal(readSession(`${forged}.${mac}`, "secreto-a"), null);
    assert.equal(readSession(`${body}.${mac}x`, "secreto-a"), null);
    assert.equal(readSession(token, "secreto-a", claims.exp + 1), null);
    assert.equal(readSession("basura", "secreto-a"), null);
    assert.equal(readSession(token, ""), null);
    assert.notEqual(passwordVersion("hash-1"), passwordVersion("hash-2"));
  });

  console.log(`\n${passed} verificaciones OK`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

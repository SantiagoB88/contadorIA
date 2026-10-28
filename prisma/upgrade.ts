// Actualiza los DATOS de una base creada con una entrega anterior (el esquema lo actualiza `prisma db push`).
// Corre antes de `npm run dev`. Cada actualización se aplica una sola vez y queda anotada en AppMeta.
import { PrismaClient } from "@prisma/client";
import { SCHEMA_META_KEY, SCHEMA_VERSION } from "../src/lib/schema-version";

const prisma = new PrismaClient();

// CUIT de demo de la entrega 1 → CUIT de demo con dígito verificador válido.
const CUIT_FIX: Record<string, string> = {
  "27000000011": "27000000014",
  "20000000022": "20000000028",
  "20000000033": "20000000036",
  "27000000044": "27000000049",
  "20000000055": "20000000052",
  "27000000066": "27000000065",
  "30000000077": "30000000074",
};

async function upgradeEntrega2() {
  const key = "upgrade-entrega2";
  if (await prisma.appMeta.findUnique({ where: { key } })) return;
  if ((await prisma.study.count()) === 0) return; // base vacía: la llena el seed

  await prisma.$transaction(async (tx) => {
    // 1. Los usuarios que ya existían no tenían verificación de correo: se dan por verificados.
    await tx.user.updateMany({ where: { emailVerifiedAt: null }, data: { emailVerifiedAt: new Date() } });

    // 2. El registro público necesita un estudio que acepte altas: el primero creado.
    if ((await tx.study.count({ where: { acceptsSignups: true } })) === 0) {
      const first = await tx.study.findFirst({ orderBy: { createdAt: "asc" } });
      if (first) await tx.study.update({ where: { id: first.id }, data: { acceptsSignups: true } });
    }

    // 3. Los accesos PENDIENTES pasan a ser solicitudes (un acceso ahora solo puede estar aprobado o revocado).
    const pending = await tx.taxpayerAccess.findMany({ where: { status: "PENDIENTE" }, include: { taxpayer: true } });
    for (const access of pending) {
      await tx.accessRequest.create({
        data: {
          studyId: access.taxpayer.studyId,
          userId: access.userId,
          cuit: CUIT_FIX[access.taxpayer.cuit] ?? access.taxpayer.cuit,
          declaredName: access.taxpayer.name,
          declaredActivity: access.taxpayer.activity,
          declaredCategory: access.taxpayer.categoryCode,
          declaredStartDate: access.taxpayer.startDate,
          status: "PENDIENTE",
        },
      });
      await tx.taxpayerAccess.delete({ where: { id: access.id } });
    }

    // 4. CUIT ficticios con dígito verificador válido.
    for (const [from, to] of Object.entries(CUIT_FIX)) {
      await tx.taxpayer.updateMany({ where: { cuit: from }, data: { cuit: to } });
    }

    await tx.appMeta.create({ data: { key, value: new Date().toISOString() } });
  });
  console.log("[ContadorSmart] Base actualizada para la entrega 2.");
}

async function upgradeEntrega4() {
  const key = "upgrade-entrega4";
  if (await prisma.appMeta.findUnique({ where: { key } })) return;
  if ((await prisma.study.count()) === 0) return;

  await prisma.$transaction(async (tx) => {
    // 1. Las escalas pasan a ser de cada estudio. Las que no tenían estudio quedan en el primero
    //    y se copian a los demás estudios que no tengan ninguna.
    const studies = await tx.study.findMany({ orderBy: { createdAt: "asc" } });
    const orphans = await tx.taxScaleVersion.findMany({ where: { studyId: null }, include: { limits: true } });
    if (orphans.length > 0) {
      for (const other of studies.slice(1)) {
        if ((await tx.taxScaleVersion.count({ where: { studyId: other.id } })) > 0) continue;
        for (const scale of orphans) {
          await tx.taxScaleVersion.create({
            data: {
              studyId: other.id,
              name: scale.name,
              source: scale.source,
              status: scale.status,
              validFrom: scale.validFrom,
              validTo: scale.validTo,
              limits: { create: scale.limits.map((l) => ({ code: l.code, annualLimitCents: l.annualLimitCents })) },
            },
          });
        }
      }
      await tx.taxScaleVersion.updateMany({ where: { studyId: null }, data: { studyId: studies[0].id } });
    }

    // 2. Historial de categoría: la categoría actual rige desde el inicio de actividad.
    const taxpayers = await tx.taxpayer.findMany({ where: { categoryCode: { not: null }, categoryHistory: { none: {} } } });
    for (const t of taxpayers) {
      await tx.categoryHistory.create({
        data: { taxpayerId: t.id, code: t.categoryCode, validFrom: t.startDate, reason: "Categoría registrada antes del historial" },
      });
    }

    await tx.appMeta.create({ data: { key, value: new Date().toISOString() } });
  });
  console.log("[ContadorSmart] Base actualizada para la entrega 4.");
}

async function main() {
  await upgradeEntrega2();
  await upgradeEntrega4();
  // Marca que la base ya tiene la estructura que espera el código (ver src/lib/db-status.ts).
  await prisma.appMeta.upsert({
    where: { key: SCHEMA_META_KEY },
    update: { value: SCHEMA_VERSION },
    create: { key: SCHEMA_META_KEY, value: SCHEMA_VERSION },
  });
}

main()
  .catch((err) => {
    console.error("[ContadorSmart] No se pudo actualizar la base:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

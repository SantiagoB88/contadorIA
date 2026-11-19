// Base inicial del piloto (servidor propio): un estudio que acepta altas y su administrador. Sin datos de ejemplo ni
// usuarios con contraseñas conocidas. Lo corre scripts/server-start.mjs solo si la base está vacía.
// Datos del administrador desde el entorno (archivo privado del servidor, nunca en el repositorio):
//   PILOT_STUDY_NAME, PILOT_ADMIN_EMAIL, PILOT_ADMIN_NAME, PILOT_ADMIN_PASSWORD.
import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import { SCHEMA_META_KEY, SCHEMA_VERSION } from "../src/lib/schema-version";

const prisma = new PrismaClient();

async function main() {
  if ((await prisma.study.count()) > 0) {
    console.log("[piloto] La base ya tiene datos: no se toca.");
    return;
  }
  const email = process.env.PILOT_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.PILOT_ADMIN_PASSWORD ?? "";
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new Error("Falta PILOT_ADMIN_EMAIL (correo del administrador).");
  if (password.length < 12) throw new Error("PILOT_ADMIN_PASSWORD tiene que tener al menos 12 caracteres.");

  const study = await prisma.study.create({ data: { name: process.env.PILOT_STUDY_NAME?.trim() || "Estudio", acceptsSignups: true } });
  const admin = await prisma.user.create({
    data: {
      studyId: study.id,
      email,
      name: process.env.PILOT_ADMIN_NAME?.trim() || "Administrador",
      passwordHash: await hash(password, 10),
      role: "ADMIN",
      emailVerifiedAt: new Date(), // lo carga quien administra el servidor
    },
  });
  await prisma.appMeta.createMany({
    data: [
      { key: "upgrade-entrega2", value: "piloto" },
      { key: "upgrade-entrega4", value: "piloto" },
      { key: SCHEMA_META_KEY, value: SCHEMA_VERSION },
    ],
  });
  await prisma.auditEvent.create({ data: { studyId: study.id, actorId: admin.id, action: "SEED", entity: "Study", entityId: study.id, detail: "Base inicial del piloto" } });
  console.log(`[piloto] Estudio "${study.name}" y administrador ${email} creados.`);
}

main()
  .catch((err) => {
    console.error(`[piloto] ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

// Solicitud de prueba para el piloto (datos ficticios): sirve para comprobar la Bandeja y que los datos sobreviven a
// un reinicio del servicio sin tener WhatsApp conectado todavía.
//   npx tsx scripts/solicitud-de-prueba.ts          → crea (una sola vez) un cliente ficticio y su solicitud
//   npx tsx scripts/solicitud-de-prueba.ts contar   → solo cuenta (para después del reinicio)
// Usa DATABASE_URL (la base del servidor). No toca nada más.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const CUIT = "20123456786"; // CUIT de prueba con dígito verificador válido
const SUBJECT = "Solicitud de prueba del piloto";

async function main() {
  const onlyCount = process.argv.includes("contar");
  const admin = await prisma.user.findFirst({ where: { role: "ADMIN" }, orderBy: { createdAt: "asc" } });
  if (!admin) throw new Error("No hay un administrador en la base (¿arrancó el servicio al menos una vez?).");
  if (!onlyCount) {
    const taxpayer =
      (await prisma.taxpayer.findUnique({ where: { studyId_cuit: { studyId: admin.studyId, cuit: CUIT } } })) ??
      (await prisma.taxpayer.create({ data: { studyId: admin.studyId, cuit: CUIT, name: "Cliente de prueba (piloto)", activity: "Prueba" } }));
    const existing = await prisma.serviceRequest.findFirst({ where: { taxpayerId: taxpayer.id, subject: SUBJECT } });
    if (!existing) {
      await prisma.$transaction(async (tx) => {
        const request = await tx.serviceRequest.create({
          data: { studyId: admin.studyId, taxpayerId: taxpayer.id, createdById: admin.id, topic: "DOCUMENTACION", subject: SUBJECT, status: "ABIERTA", channel: "WEB" },
        });
        await tx.requestMessage.create({
          data: { requestId: request.id, authorId: admin.id, body: "Prueba: esta solicitud tiene que seguir en la Bandeja después de reiniciar el servicio.", visibility: "PUBLICA", channel: "WEB" },
        });
      });
      console.log("Solicitud de prueba creada.");
    } else {
      console.log("La solicitud de prueba ya existía (no se crea otra).");
    }
  }
  const count = await prisma.serviceRequest.count({ where: { subject: SUBJECT } });
  console.log(`Solicitudes de prueba en la base: ${count}`);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());

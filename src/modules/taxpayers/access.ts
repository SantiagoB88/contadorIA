import { prisma } from "@/lib/db";
import { ACCESS_STATUS, ROLES } from "@/lib/constants";
import type { CurrentUser } from "@/lib/auth";

/**
 * Contribuyentes que el usuario puede ver.
 * - ADMIN: todos los de su estudio.
 * - CLIENTE: solo los que tienen acceso APROBADO y pertenecen a su estudio.
 * El estudio sale siempre de la sesión, nunca de un parámetro del navegador.
 */
export async function getAccessibleTaxpayers(user: CurrentUser) {
  if (user.role === ROLES.ADMIN) {
    return prisma.taxpayer.findMany({
      where: { studyId: user.studyId },
      orderBy: { name: "asc" },
    });
  }
  return prisma.taxpayer.findMany({
    where: {
      studyId: user.studyId,
      accesses: { some: { userId: user.id, status: ACCESS_STATUS.APROBADO } },
    },
    orderBy: { name: "asc" },
  });
}

/** Devuelve el contribuyente si el usuario tiene permiso; si no, null. */
export async function getAuthorizedTaxpayer(user: CurrentUser, taxpayerId: string) {
  if (!taxpayerId) return null;
  const where =
    user.role === ROLES.ADMIN
      ? { id: taxpayerId, studyId: user.studyId }
      : {
          id: taxpayerId,
          studyId: user.studyId,
          accesses: { some: { userId: user.id, status: ACCESS_STATUS.APROBADO } },
        };
  return prisma.taxpayer.findFirst({ where });
}

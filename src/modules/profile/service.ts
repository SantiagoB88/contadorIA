import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { hashPassword, passwordProblem, verifyPassword } from "@/lib/crypto";
import type { CurrentUser } from "@/lib/auth";
import type { ServiceResult } from "@/modules/access/service";

export async function updateProfile(user: CurrentUser, nameInput: string, phoneInput: string): Promise<ServiceResult> {
  const name = nameInput.trim();
  const phone = phoneInput.trim();
  const fieldErrors: Record<string, string> = {};
  if (name.length < 2 || name.length > 120) fieldErrors.name = "Ingresá tu nombre (2 a 120 caracteres).";
  if (!/^\+?[\d\s()-]{8,20}$/.test(phone)) fieldErrors.phone = "Ingresá un teléfono válido, por ejemplo +54 11 5555-5555.";
  if (Object.keys(fieldErrors).length > 0) return { ok: false, message: "Revisá los campos marcados.", fieldErrors };

  await prisma.user.update({ where: { id: user.id }, data: { name, phone } });
  await audit({ studyId: user.studyId, actorId: user.id, action: "PROFILE_UPDATE", entity: "User", entityId: user.id });
  return { ok: true, message: "Datos actualizados." };
}

/** Cambia la contraseña y cierra todas las sesiones del usuario (quien la cambia vuelve a recibir una nueva). */
export async function changePassword(
  user: CurrentUser,
  current: string,
  next: string,
  confirm: string,
): Promise<ServiceResult> {
  const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
  if (!(await verifyPassword(current, row.passwordHash))) {
    return { ok: false, message: "Revisá los campos marcados.", fieldErrors: { current: "La contraseña actual no es correcta." } };
  }
  const problem = passwordProblem(next);
  if (problem) return { ok: false, message: "Revisá los campos marcados.", fieldErrors: { next: problem } };
  if (next !== confirm) return { ok: false, message: "Revisá los campos marcados.", fieldErrors: { confirm: "Las contraseñas no coinciden." } };

  await prisma.$transaction([
    prisma.user.update({ where: { id: user.id }, data: { passwordHash: await hashPassword(next) } }),
    prisma.session.deleteMany({ where: { userId: user.id } }),
  ]);
  await audit({ studyId: user.studyId, actorId: user.id, action: "PASSWORD_CHANGE", entity: "User", entityId: user.id });
  return { ok: true, message: "Contraseña actualizada." };
}

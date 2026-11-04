import type { Ctx } from "./core";

// Registro de acciones (opciones tocadas) y de pasos que esperan texto o un archivo.
// Cada archivo de recorridos agrega acá sus manejadores.

export type Upload = { id: string; fileName: string };
export type ActionHandler = (ctx: Ctx, value?: string) => Promise<void>;
export type TextHandler = (ctx: Ctx, text: string) => Promise<void>;
export type UploadHandler = (ctx: Ctx, upload: Upload) => Promise<void>;

export const actions: Record<string, ActionHandler> = {};
export const textSteps: Record<string, TextHandler> = {};
export const uploadSteps: Record<string, UploadHandler> = {};

/** Acciones que solo consultan: si fallan, se ofrece reintentar (no hay riesgo de duplicar nada). */
export const readOnly = new Set<string>();

/** Acciones disponibles sin contribuyente habilitado (alta pendiente o accesos revocados). */
export const withoutTaxpayer = new Set<string>();

export function on(action: string, handler: ActionHandler, opts: { readOnly?: boolean; noTaxpayer?: boolean } = {}) {
  actions[action] = handler;
  if (opts.readOnly) readOnly.add(action);
  if (opts.noTaxpayer) withoutTaxpayer.add(action);
}

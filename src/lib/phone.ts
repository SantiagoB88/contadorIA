import { parsePhoneNumberWithError } from "libphonenumber-js/max";

// Teléfonos normalizados a formato internacional E.164 (+5491155550001) con libphonenumber-js.
// WhatsApp informa los números sin "+" (5491155550001); un número argentino escrito como "011 15 5555-0001"
// también queda igual. Nunca se arma un número a mano.

/** Número normalizado o null si no es un teléfono válido. Sin código de país, se asume Argentina. */
export function normalizePhone(input: string): string | null {
  const raw = input.trim();
  if (!raw) return null;
  // Los ids de WhatsApp son solo dígitos con código de país.
  const candidate = /^\d{10,15}$/.test(raw) && raw.startsWith("54") ? `+${raw}` : raw;
  try {
    const phone = parsePhoneNumberWithError(candidate, "AR");
    return phone.isValid() ? phone.number : null;
  } catch {
    return null;
  }
}

/** "+5491155550001" → "+54 9 11 ****-0001": suficiente para reconocerlo sin mostrarlo completo. */
export function maskPhone(e164: string): string {
  try {
    const formatted = parsePhoneNumberWithError(e164).formatInternational();
    const digits = formatted.replace(/\D/g, "");
    let seen = 0;
    const keepFrom = digits.length - 4;
    const prefixDigits = Math.min(5, keepFrom);
    return formatted.replace(/\d/g, (d) => {
      const i = seen++;
      return i < prefixDigits || i >= keepFrom ? d : "*";
    });
  } catch {
    return "número no válido";
  }
}

/** "+5491155550001" → "+54 9 11 5555-0001" (formato internacional legible). Si no se puede leer, queda igual. */
export function formatPhone(e164: string): string {
  try {
    return parsePhoneNumberWithError(e164).formatInternational();
  } catch {
    return e164;
  }
}

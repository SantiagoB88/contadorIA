/** Número visible de una solicitud: el mismo en la web, en los avisos y en el bot (por ejemplo S-4F2K9Q). */
export function requestCode(id: string): string {
  return `S-${id.slice(-6).toUpperCase()}`;
}

/**
 * Número público del WhatsApp de ContadorIA (WHATSAPP_PUBLIC_NUMBER, con código de país, por ejemplo 5491155550000).
 * Con él la web arma un botón "Abrir WhatsApp" con el texto ya escrito. Sin él, se muestra solo el código.
 */
export function whatsappChatUrl(text: string): string | null {
  const digits = (process.env.WHATSAPP_PUBLIC_NUMBER ?? "").replace(/\D/g, "");
  if (digits.length < 10) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

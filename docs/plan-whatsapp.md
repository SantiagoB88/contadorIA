# Bot de WhatsApp: diagnóstico y plan de integración

Fecha: 04/11/2026. Repositorio revisado: `https://github.com/Mateobonacalza/ContadorSmart` (rama `main`, commit `7be8558`), copiado en `externo/ContadorSmart-bot/` (fuera de Git: no se sube).

> **Estado (04/11/2026):** implementado en la rama `feat/whatsapp-bot` siguiendo este plan. Ver `docs/estado.md`, `docs/whatsapp-contratos.md`, `docs/whatsapp-demo.md` y `docs/whatsapp-prueba-real.md`.

## 1. Qué hay en cada lado

| | Bot (`externo/ContadorSmart-bot`) | Web (este proyecto, publicado en contadoia.vercel.app) |
|---|---|---|
| Qué es | Servidor Express de Node con el webhook de WhatsApp (Meta Cloud API), un menú de 7 trámites y un chat por terminal (`npm run chat`) | Next.js + Prisma: portal del cliente y backoffice del estudio |
| Datos | `data/clients.json` (clientes por número de teléfono) y conversaciones **en memoria** | Base SQLite con usuarios, contribuyentes, accesos, facturas, deudas, solicitudes y documentos |
| Lógica fiscal | `server/flows/mockBackend.js`: **inventa** facturación, deuda y categoría a partir de un hash del CUIT | Servicios reales del proyecto (`src/modules/*`), con cobertura de datos y reglas de deuda |
| Conexión entre ambos | **Ninguna**. El bot no llama a ninguna API (verificado: el único `fetch` es a la API de WhatsApp) | — |

El repositorio del bot **no contiene la dashboard**. La dashboard es este proyecto.

## 2. Qué sirve del bot

- Validación de la firma del webhook con el App Secret de Meta (`server/whatsapp/webhook.js`, `isValidSignature`, HMAC SHA-256 con comparación segura).
- Verificación de la suscripción del webhook (`verifySubscription`).
- Envío de texto, botones y listas de WhatsApp con texto alternativo si fallan (`server/whatsapp/client.js`).
- La experiencia del menú: saludo, opciones numeradas, "0" para volver atrás y botones o listas (`server/flows/engine.js`).
- La guía de alta en Meta y ngrok (`README-WHATSAPP.md`), a revalidar contra la documentación vigente de Meta antes de usarla.

## 3. Problemas encontrados (con evidencia)

1. **Pide y guarda la clave fiscal del cliente.**
   - En el alta (`server/flows/definitions.js`, campo `fiscal_key`, opción "Te la paso yo mismo/a por este chat").
   - Para facturar por RPA (`emission_method: rpa_clave_fiscal`).
   - Se guarda cifrada en `data/clients.json` (`server/session/store.js`, `saveFiscalKey`).
   - El plan del proyecto lo prohíbe explícitamente: no se pide clave fiscal por chat ni se guarda.
2. **Inventa datos fiscales.**
   - `estado_facturacion` calcula la "facturación" con `hashToRange(cuit, 500000, 9500000)`.
   - `pagos/consulta_deuda` inventa una deuda.
   - La escala de categorías está fija en el código.
   - Contradice la regla de no mostrar cifras sin datos.
3. **Identidad por teléfono, sin cuenta ni autorización.**
   - Cualquiera que escriba un CUIT ve "su" facturación.
   - No existe el concepto de cuenta, acceso aprobado ni vinculación verificada.
4. **Conversaciones en memoria**: se pierden al reiniciar (lo dice su propio README).
5. **Sin deduplicación de mensajes.** Meta puede reenviar el mismo evento. Además se responde 200 antes de guardar el evento: si el proceso se cae, el mensaje se pierde.
6. **Sin firma obligatoria**: si falta `WHATSAPP_APP_SECRET`, acepta cualquier pedido (`isValidSignature` devuelve `true`).
7. **Comprobantes PDF públicos** por URL en `/comprobantes/:id.pdf`, sin autorización.
8. **Fuera de alcance**: recategorización y altas/bajas generan un "ticket" que no llega a ningún lado.

## 4. Decisión de arquitectura propuesta

**Llevar el bot adentro de la web** (mismo proyecto Next.js), en lugar de mantener dos servidores:

- **Webhook**: `POST/GET /api/whatsapp/webhook` en la web, con la validación de firma del bot actual, ahora obligatoria.
- **Motor de conversación**: `src/modules/bot/`, sin dependencias de Next. Consume los **mismos servicios** que usa la web:
  - `getDashboardData`, `getDebtSummary`;
  - `createRequest`, `addMessage`, `getRequestForUser`;
  - `getAuthorizedTaxpayer`, `requestAssociation`.
  No se duplica ningún cálculo.
- **Transporte separado**: `WhatsAppTransport` (Meta) y `SimulatorTransport` (local). Así se prueba lo mismo sin WhatsApp.
- **Tablas nuevas**:
  - `ChannelLink`: usuario ↔ número de WhatsApp verificado, con estado y fecha de baja.
  - `LinkCode`: código de un solo uso, con vencimiento e intentos.
  - `BotConversation`: estado persistente de cada conversación.
  - `InboundEvent`: cada evento de WhatsApp con su id, único, guardado **antes** de procesarlo.
  - `OutboundMessage`: estados pendiente, enviado o fallido.
- **Lo que se descarta del bot**: la clave fiscal, el backend simulado, la escala fija y `clients.json`.

Por qué adentro y no como servicio aparte:
- **Una sola lógica de negocio**: el pedido lo exige y en este proyecto es directo.
- **Menos piezas**: un solo deploy, sin una API interna ni credenciales entre servicios.
- **Sale gratis lo que ya existe**: el campo `channel` de solicitudes y mensajes y los servicios sin Next.

Si más adelante se quiere un servicio aparte, el motor ya queda separado del transporte.

## 5. Recorridos que se implementan

**Persona nueva desde el bot**
1. Recibe la bienvenida y un enlace a `/registro`. El enlace lleva un código de un solo uso que, al terminar el alta, deja la cuenta lista para vincular ese número.
2. No se piden contraseña ni clave fiscal en el chat.
3. El CUIT se declara en la web y queda **pendiente** en Backoffice → Accesos.
4. Hasta que el estudio aprueba, el bot solo informa "pendiente".

**Usuario que ya tiene cuenta**
1. En **Mi perfil → WhatsApp** genera un código de 6 dígitos que vence en 10 minutos, admite 5 intentos y sirve una sola vez.
2. Lo manda por WhatsApp y el número queda vinculado.
3. Nunca se vincula por coincidencia de teléfono o CUIT.
4. Si el número ya estaba vinculado a otra cuenta, se exige una verificación nueva: el acceso nunca se transfiere en silencio.

**Menú del bot (cuenta vinculada)**
1. Estado del alta.
2. Resumen de facturación: el mismo servicio del tablero, con período, fecha de actualización y "información incompleta" cuando corresponde.
3. Margen de categoría (orientativo).
4. Deudas y vencimientos: "No disponible" si el estudio no cargó nada, nunca "sin deuda".
5. Crear una solicitud al contador, con canal `WHATSAPP` y visible en la Bandeja.
6. Ver mis solicitudes y la respuesta del estudio, nunca las notas internas.
7. Pedir atención humana: crea una solicitud de prioridad alta.
8. "Quiero hacer una factura": crea una solicitud. La factura se hace en la web, en modo demo.

Si tiene varios contribuyentes, elige cuál. Cada operación vuelve a validar los permisos en el servidor.

**Estudio (web)**
- Ve el estado de vinculación de WhatsApp de cada usuario y puede desvincular.
- Las solicitudes llegan con el canal "WhatsApp".
- Responde igual que hoy. La respuesta se envía por WhatsApp si el proveedor está configurado; si no, queda **pendiente** y se ve así.
- Suspender, revocar o desvincular corta el acceso en la consulta siguiente.

## 6. Cómo se prueba (sin WhatsApp primero)

1. **Simulador visual** en `/dev/whatsapp`, solo local o en DEMO, deshabilitado en producción.
   - Se elige una identidad ficticia (nuevo, pendiente, aprobado, revocado) y se chatea.
   - Usa el mismo webhook y los mismos servicios: solo reemplaza a WhatsApp.
   - Botones para duplicar el último evento, simular una caída del servicio y reiniciar.
2. **Pruebas automáticas**: las 15 pedidas, en `npm run verify` y en los recorridos de Playwright.
3. **Prueba real con WhatsApp**, en la compu y sin base online:
   - número de prueba de Meta;
   - `npm run dev`;
   - un túnel HTTPS (ngrok o cloudflared) hacia `/api/whatsapp/webhook`.
   Necesita una cuenta de Meta for Developers y que vos verifiques tu número como destinatario de prueba. Guía en `docs/whatsapp-prueba-real.md` (se escribe con la documentación oficial vigente).

## 7. Límite importante: Vercel

La demo de Vercel usa una copia de la base **por instancia** y se reinicia sola, así que **el bot no puede vivir ahí de forma confiable**:
- Un mensaje puede caer en una instancia y la respuesta del estudio en otra.
- Se pierden vínculos y conversaciones.

Probablemente es también la causa del error reportado ("un borrador aparecía en el listado, daba 404 al abrirlo y después desaparecía"): el listado y el detalle los atendieron instancias distintas. En la compu no se reprodujo: el borrador se crea, se abre y se borra bien (cubierto en las pruebas de Playwright).

Para tener el bot en un link público hace falta una base compartida, que es la entrega 6 (PostgreSQL). Mientras tanto, la prueba real se hace en la compu con el túnel.

## 8. Decisiones que necesito de vos

1. **Arquitectura**: bot adentro de la web (recomendado) o como servidor aparte que llame a la API de la web.
2. **Clave fiscal**: sacarla del bot (recomendado y exigido por el plan del proyecto).
3. **Prueba real**: cuando el resto esté listo, vas a necesitar una cuenta de Meta for Developers y tu número de WhatsApp para recibir mensajes de prueba. Los tokens se cargan en `.env` en tu compu: nunca por el chat.

## 9. Fuera de alcance de esta etapa

- Emisión fiscal real con ARCA.
- IA para entender texto libre: el menú funciona sin IA y es lo que se puede probar.
- Envío proactivo de mensajes fuera de la ventana de 24 h de WhatsApp: requiere plantillas aprobadas por Meta.
- Publicar el bot en Vercel antes de la base compartida.

# Acceso web y etapa fiscal: estado y decisiones pendientes

## Circuito actual (revisado en el código, noviembre 2026)

- **Alta por WhatsApp** (`src/modules/bot/flows-signup.ts`):
  - pide nombre, correo, CUIT y actividad (ya no la fecha de inicio);
  - crea la cuenta con una contraseña temporal de 72 horas, guardada con el hash del sistema (bcrypt, `src/lib/crypto.ts`), que hay que cambiar al entrar;
  - vincula el número y pide el acceso al CUIT;
  - termina con el **próximo paso** y los botones "Mi configuración" y "Necesito ayuda".
- **Dependencia del administrador**: si el CUIT es nuevo para el estudio, el acceso es inmediato. Si el CUIT ya es de otro cliente del estudio, lo aprueba el estudio, para que nadie vea datos ajenos sabiendo un CUIT. Es la única intervención administrativa, y es deliberada.
- **Correo**:
  - se manda un enlace de confirmación con un token aleatorio, guardado como hash, que vence y sirve una sola vez (`AuthToken`);
  - **en modo DEMO los correos no salen**: quedan en `OutboxEmail` y se ven en `/dev/correos`. No hay un proveedor de correo real configurado.
  - Mientras el correo no esté confirmado, se puede entrar a la web igual si el WhatsApp quedó vinculado (prueba que el teléfono es de la persona).
- **Estado de configuración** (`src/modules/profile/setup.ts`): lo ven igual la web (Mi perfil → Tu configuración) y el bot (Mi cuenta → Mi configuración). Muestra:
  - contraseña propia;
  - correo confirmado;
  - WhatsApp;
  - acceso al CUIT;
  - fecha de inicio;
  - **conexión con ARCA: "todavía no disponible"**, que nunca se muestra como lista.
- **Pedido de ayuda**:
  - "Necesito ayuda / Solicitar una llamada" crea una solicitud con el tema `AYUDA`, que el estudio ve en la Bandeja;
  - hay un solo pedido abierto por persona, aunque se repita o haya doble clic;
  - no se promete un horario y se pide no escribir contraseñas.
- **Retomar**: el estado se calcula siempre desde la base, así que se puede retomar desde cualquier canal sin crear otra cuenta. "Entrar a la web" en el bot recuerda los datos de ingreso y puede generar otra contraseña temporal solo mientras la persona no haya elegido la suya.

## ARCA: lo que dice la documentación (verificado el 16/11/2026)

- Los web services de ARCA se autentican con el **WSAA**:
  - certificado digital X.509 emitido por ARCA;
  - un Ticket de Acceso por servicio;
  - ambientes separados de homologación y producción.

  [WSAA](https://www.arca.gob.ar/ws/documentacion/wsaa.asp), [Arquitectura](https://www.afip.gob.ar/ws/documentacion/arquitectura-general.asp).
- **Consulta de datos de un CUIT** (razón social, condición): servicio "Padrón Constancia de Inscripción" (`ws_sr_constancia_inscripcion`), que reemplaza a Padrón A5. Ver [catálogo de WS](https://www.arca.gob.ar/ws/documentacion/catalogo.asp).
- **Emisión de facturas**: WSFEv1. Para emitir en nombre de un contribuyente, el contribuyente **delega el servicio** en el CUIT de quien lo usa (el estudio) desde el "Administrador de Relaciones de Clave Fiscal", y el estudio acepta la designación. Ver la [guía de ARCA sobre delegación](https://www.afip.gob.ar/guias/paso-a-paso/Como-delego-servicios-para-que-utilicen-en-mi-nombre-como-se-acepta-delegacion.pdf).
- Conclusión: **la integración no requiere guardar la clave fiscal personal del cliente.** Lo que se guarda es el certificado y la clave privada del estudio (secretos del servidor, nunca en la base ni en tickets). El cliente hace una vez la delegación en el sitio de ARCA, con su propia clave fiscal.
- Los nombres exactos de menús y servicios hay que confirmarlos en el portal vigente antes de implementar: parte del detalle encontrado viene de proveedores privados (yo-facturo.com, afipsdk.com), no de ARCA.

## Qué quedó hecho y qué no

- **Implementado:**
  - conector de padrón con interfaz y manejo de fallas (`src/providers/padron.ts`). Hoy responde "no disponible" y el recorrido pide la razón social a mano. En las pruebas se usan dobles;
  - estado de configuración;
  - pedido de ayuda;
  - próximo paso en el bot.
- **No implementado (decisiones pendientes):**
  1. ¿En qué momento se exige completar la etapa fiscal? Por ejemplo: antes de la primera emisión real, o al darse de alta.
  2. ¿Qué operaciones quedan habilitadas antes? Hoy todo es simulación: consultar, preparar facturas en modo demo, pedir documentos y hacer solicitudes.
  3. Mecanismo: ¿certificado del estudio con delegación de cada cliente (lo recomendado por la documentación), o certificado propio de cada cliente?
  4. ¿Quién gestiona el certificado y en qué ambiente se homologa primero?
  5. Proveedor de correo real para producción (hoy solo la bandeja local).

# ContadorSmart · V1 local (versión simple)

Portal del contribuyente + backoffice del estudio. Todo corre en tu compu, con datos ficticios y **sin conexión con ARCA**.

## Requisitos

- Node.js 20 o superior (probado con Node 22.16)
- Nada más: la base es un archivo SQLite local (`prisma/dev.db`) y los documentos se guardan en la carpeta `storage/`. No hace falta Docker ni PostgreSQL.

## Arrancar

```bash
npm install
npm run dev
```

Abrí http://localhost:3000.

Antes de levantar, `npm run dev` prepara la base:
- si no existe, la crea con los datos de demo;
- si existe, le aplica los cambios nuevos **sin borrar lo que cargaste**.

> Después de actualizar el código (por ejemplo, con `git pull`), cortá `npm run dev` con Ctrl+C y volvé a levantarlo, así se aplican los cambios de la base. Si te olvidás, la app no tira un error técnico: muestra la pantalla "Falta reiniciar la aplicación" con los pasos.

## Usuarios de demo

Contraseña de todos: `Demo1234!` (solo existen en esta base local).

| Usuario | Rol | Qué ve |
|---|---|---|
| `admin@contadorsmart.local` | Administrador | Los contribuyentes del Estudio Demo, backoffice, bandeja y accesos |
| `contadora@contadorsmart.local` | Administradora | Igual que el admin. Sirve para asignarle solicitudes (solo existe si la base se creó o reseteó con la entrega 5) |
| `cliente.a@contadorsmart.local` | Cliente | Ana Gómez (normal) y Martín Gómez (próximo al límite) |
| `cliente.b@contadorsmart.local` | Cliente | Bruno Díaz (límite superado). Tiene una solicitud *pendiente* para Elena Paz que **no** le da acceso |
| `admin.otro@contadorsmart.local` | Administrador | Otro estudio (sirve para probar aislamiento) |

Perfiles sembrados:

| Contribuyente | Límite | Deudas |
|---|---|---|
| Ana | Normal | Sin deuda informada, con un vencimiento próximo |
| Elena | Preventivo (~85 %). Pasó de la categoría E a la F hace 6 meses | Pago informado, falta que el estudio lo verifique |
| Martín | Próximo al límite (~98 %) | No disponible: el estudio no cargó nada |
| Bruno | Superado (~109 %) | Deuda informada: tres vencimientos impagos, uno sin importe |
| Carla | Sin actividad (cero real) | Sin deuda informada |
| Diego | Información incompleta | No disponible |

Hay dos escalas **ficticias**: la del año pasado (límites más bajos) y la vigente desde el 1 de enero.

Solicitudes de demo:
- Ana: pidió la constancia de inscripción. Está resuelta y tiene el PDF adjunto.
- Martín: consulta por recategorización. El estudio espera su respuesta.
- Bruno: quiere regularizar la deuda. Es nueva, de prioridad alta y sin asignar.

Todos los PDF dicen "DOCUMENTO DE DEMOSTRACIÓN".

## Correos de prueba

En la demo no se envía ningún correo real. Los correos de verificación y recuperación quedan en **http://localhost:3000/dev/correos** (también hay un enlace abajo del login).

## Recorridos de prueba

**Tablero (entrega 1)**
1. Entrá como `cliente.a`: vas a ver el tablero de Ana. Cambiá a Martín con el selector y probá otro período.
2. Tocá "Ver N comprobantes" en una tarjeta: aparecen los comprobantes que suman ese total. El borrador aparece tachado y no suma.
3. Entrá como admin y copiá la URL del tablero de Bruno. Abrila con `cliente.a`: tiene que decir "No tenés acceso".
4. Como admin, andá a Backoffice → Ana → "Cargar comprobante manual". Volvé al tablero: el total cambió.

**Alta de un cliente nuevo (entrega 2)**
1. En el login tocá "Creá una" y registrate con un correo inventado.
2. Andá a `/dev/correos`, abrí el enlace "Confirmá tu correo" y tocá "Confirmar mi correo".
3. Ingresá. El tablero te pide asociar tu CUIT: cargá uno. Para probar podés usar `20-12345678-6`, que es nuevo, o `27-00000001-4`, que es el de Ana.
4. Vas a ver "solicitud pendiente" y ningún dato fiscal todavía.
5. Entrá como admin, andá a **Accesos** y aprobá la solicitud. Al volver a ingresar como el cliente nuevo, ya ves el contribuyente.
6. En Accesos, **revocá** ese acceso. El cliente lo deja de ver apenas cambia de pantalla.
7. En Accesos → Usuarios, **suspendé** al cliente: se le cierra la sesión y ya no puede ingresar.

**Facturador en modo demo (entrega 3)**
1. Entrá como `cliente.a` y tocá **Nueva factura**, desde el tablero o desde Facturación.
2. Elegí un receptor guardado o cargá uno nuevo. Agregá conceptos: el total se actualiza mientras escribís.
3. Tocá "Guardar borrador y revisar". Revisá los datos y tocá **Confirmar emisión simulada**. La factura recibe el número `C 00001-00000001`.
4. Descargá el PDF: dice "SIMULACIÓN SIN VALIDEZ FISCAL" y no tiene CAE.
5. Volvé al tablero: el total del mes subió por el importe de la factura.
6. Hacé otra factura y, antes de confirmar, marcá "Simular un rechazo". Queda rechazada, no suma y no consume número. Con "Crear borrador a partir de esta" la podés corregir.
7. Con `cliente.b`, abrí la URL de una factura de Ana: tiene que dar "no encontrado".

**Categorías, escalas y deudas (entrega 4)**
1. Entrá como `cliente.a` y, en el tablero, tocá "Ver cómo se calcula y la escala" en la tarjeta de margen. Vas a ver:
   - la categoría registrada;
   - la categoría orientativa por ingresos;
   - la cuenta del margen paso a paso;
   - la escala aplicada.
2. Elegí un mes del año pasado en el selector: se aplica la escala de ese momento y los indicadores cambian.
   Si tu base viene de una entrega anterior, tiene una sola escala y no tiene las deudas de ejemplo. Para ver todo, corré `npm run db:reset`, que borra lo que cargaste.
3. Entrá en **Deudas** con Ana: dice "Sin deuda informada al…" y muestra el próximo vencimiento. Con Martín dice "No disponible".
4. Entrá como admin y abrí **Escalas**. Creá una versión nueva con fecha de inicio el 1 de enero del año que viene: la vigente se cierra sola el 31 de diciembre. Si una fecha se superpone con otra versión, no te deja guardar.
5. En Backoffice → Bruno, en **Deudas y vencimientos**, marcá una cuota como "Pago verificado" con su evidencia. El total de deuda baja.
6. En Backoffice → Martín, cargá un vencimiento y registrá una revisión. Su estado pasa de "No disponible" a "Deuda informada" o "Sin deuda informada", según la fecha.
7. En Backoffice → cualquier contribuyente, registrá una categoría nueva con fecha y motivo. Queda en el historial. El sistema nunca la cambia solo, aunque se supere el límite.

**Solicitudes, notas internas y documentos (entrega 5)**

Si tu base viene de una entrega anterior, no tiene las solicitudes de ejemplo ni a la contadora. Podés crear solicitudes nuevas igual, o correr `npm run db:reset` para tener todo (borra lo que cargaste).

1. Entrá como `cliente.b` → **Solicitudes** → **Nueva solicitud**. Elegí un tema, escribí y adjuntá un PDF o una imagen.
2. Entrá como admin → **Bandeja**. La solicitud aparece como "Nueva".
   - Abrila y asignásela a la contadora.
   - Agregá una **nota interna**: se ve en amarillo.
   - Respondé al cliente y elegí el estado "Esperando respuesta del cliente".
3. Volvé a `cliente.b` y abrí la solicitud.
   - Ves la respuesta y el estado nuevo, pero no la nota interna.
   - En `/dev/correos` está el aviso de la respuesta.
   - Si respondés, la solicitud vuelve a "En curso".
4. Con `cliente.b`, en **Deudas** tocá **Informar pago** en una cuota pendiente y adjuntá el comprobante.
   - El vencimiento queda como "pago informado".
   - El estudio recibe una solicitud "Pago informado" para verificarlo desde la ficha del contribuyente.
5. Como admin, en Backoffice → Ana → **Documentos**, subí un archivo como "Solo el estudio".
   - Con `cliente.a`, en **Documentos**, no aparece.
   - Tocá "Compartir con el cliente" y ahora sí aparece.
6. Probá subir un `.html` renombrado a `.pdf`: lo rechaza.
7. Como admin, copiá la URL de descarga de un documento de Bruno ("Descargar" en Documentos). Abrila con `cliente.a`: da "No encontrado".
8. Cortá y volvé a levantar `npm run dev`: los archivos siguen ahí.

**Contraseñas**
- "¿Olvidaste tu contraseña?" → el enlace llega a `/dev/correos` → elegís una nueva. Ese enlace sirve una sola vez.
- En **Mi perfil** podés cambiar tus datos y tu contraseña.

## Comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Prepara la base y levanta la app en modo desarrollo |
| `npm run verify` | Corre 85 verificaciones (cálculos, permisos, alta, accesos, facturador, escalas, categorías, deudas, solicitudes y documentos) en una base y una carpeta de archivos **aparte** (`prisma/verify.db`, `storage-verify/`) |
| `npm run test:e2e` | Pruebas de punta a punta en el navegador (Edge): recorre la app como una persona y revisa cada pantalla en celular, tablet y escritorio. Levanta sola una copia aparte en el puerto 3100, con su propia base: no toca tus datos ni tu `npm run dev` |
| `npm run dev:test` | Levanta esa copia de prueba a mano (http://localhost:3100, base nueva en cada arranque) |
| `npm run typecheck` | Chequeo de tipos |
| `npm run build` | Build de producción |
| `npm run db:reset` | **Borra todo** (base y documentos de `storage/`) y vuelve a cargar los datos de demo |
| `npm run db:studio` | Abre Prisma Studio para mirar la base |

## Problemas frecuentes

- **`EPERM` / archivo en uso al instalar o generar Prisma**: cerrá `npm run dev` y cualquier Prisma Studio abierto, y repetí. OneDrive a veces bloquea archivos mientras sincroniza: si persiste, pausá la sincronización un momento.
- **Error de Prisma al arrancar después de actualizar**: cortá y volvé a correr `npm run dev`; si sigue, `npm install` y otra vez `npm run dev`.
- **Quiero empezar de cero**: `npm run db:reset`.
- **No puedo subir un archivo**: solo se aceptan PDF, PNG y JPG de hasta 10 MB, y hasta 3 por envío. El contenido tiene que coincidir con la extensión.
- **El puerto 3000 está ocupado**: `npx next dev -p 3001`.

## Documentación

- `docs/plan-desarrollo.md` – plan de desarrollo por entregas
- `docs/estado.md` – qué está hecho y qué no
- `docs/decisiones.md` – decisiones técnicas y supuestos
- `docs/backlog.md` – pendientes

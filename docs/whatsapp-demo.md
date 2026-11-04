# Bot de WhatsApp: probar desde cero y guion de demo (10 minutos)

## Probar desde cero (en tu compu, sin WhatsApp)

```bash
npm run dev
```

1. Abrí http://localhost:3000/dev/whatsapp: es el simulador.
2. En otra pestaña abrí la web, http://localhost:3000.

Si tu base viene de antes, no tiene a Ana con el WhatsApp ya vinculado. Podés vincularla con un código (paso 2 del guion) o correr `npm run db:reset`, que **borra lo que cargaste**.

## Guion de demo

Cada paso indica qué escribir en el simulador (o qué hacer en la web) y qué tiene que pasar.

**1. Persona nueva** (Quién escribe: "Persona nueva · sin cuenta")

| Escribí | Resultado esperado |
|---|---|
| `hola` | "Este WhatsApp todavía no está vinculado…" y las opciones 1, 2 y 3 |
| `1` | Enlace a `/registro` y enlace "vincular este WhatsApp" (vence en 24 h). Aclara que nunca pide clave fiscal |
| `2` | No muestra facturación: repite que el número no está vinculado |

**2. Cliente existente que vincula** (Quién escribe: "Bruno Díaz (cliente.b) · cuenta sin vincular")

1. En la web, ingresá como `cliente.b@contadorsmart.local` / `Demo1234!` y entrá a **Mi perfil → WhatsApp → Generar código**.
2. Escribí el código de 6 números en el simulador → "Listo, vinculamos este WhatsApp con tu cuenta. Hola, Bruno."
3. Escribí el mismo código otra vez → "El código no es válido o ya se usó".
4. Escribí `menú` → menú con 7 opciones y "Estás consultando *Bruno Díaz*".

**3. Consultas iguales a la web** (sigue Bruno)

| Escribí | Resultado esperado |
|---|---|
| `2` | Facturación del mes, semestre, año y 12 meses, con fechas: los mismos importes que el tablero de Bruno |
| `3` | Margen **orientativo**, con el límite de la categoría C y el nivel "Superado" |
| `4` | "Hay 3 vencimientos impagos…", con importes y "No incluye intereses" |

**4. Solicitud al contador** (sigue Bruno)

| Escribí | Resultado esperado |
|---|---|
| `5` | Lista de temas |
| `3` | "Escribí un asunto corto" |
| `Quiero entrar en un plan de pagos` | "Ahora contame el detalle…" |
| `Tengo 3 cuotas vencidas, ¿qué me conviene?` | "Listo, creamos tu solicitud…" |

**5. El estudio la atiende** (web, como `admin@contadorsmart.local`)

1. **Bandeja**: la solicitud figura con "canal WhatsApp".
2. Abrila y agregá una **nota interna**: "Revisar el plan vigente".
3. Respondé al cliente: "Podemos armar un plan de 6 cuotas" y elegí el estado "Esperando respuesta del cliente".
4. En "Avisos por WhatsApp" aparece "Entregado en el simulador".

**6. El cliente ve la respuesta** (simulador, Bruno)

1. Llega solo el aviso "El estudio respondió tu solicitud…" (el chat se actualiza cada 4 segundos).
2. `6` → lista con la solicitud. `1` → se ve la respuesta del estudio y **no** la nota interna.
3. `1` y después `Dale, avancemos` → "Le mandamos tu mensaje al estudio". En la web, la solicitud vuelve a "En curso".

**7. Fallas y duplicados** (simulador)

1. Tocá **Reenviar el último mensaje (duplicado)** → "Evento duplicado: se descartó".
2. En "Simular una falla", elegí **Falla antes de procesar** y escribí `2` → "Tuvimos un problema…".
3. Volvé a "Sin fallas" y tocá **Reintentar fallidos** → llega la facturación una sola vez.

**8. Corte de acceso** (web, admin → Accesos)

- **Desvincular WhatsApp** de Bruno → en el simulador, `2` ya no muestra datos.
- O bien **Suspender** a Bruno → "Tu cuenta está suspendida…".

**9. Reinicio**

Cortá `npm run dev`, volvé a levantarlo y recargá el simulador: la conversación y los datos siguen ahí.

## Pruebas automáticas

```bash
npm run verify
```

Incluye los 15 casos del bot, sobre una base aparte.

```bash
npm run test:e2e
```

Incluye el recorrido completo en el simulador y el webhook con firma, sobre una copia de la app en el puerto 3100.

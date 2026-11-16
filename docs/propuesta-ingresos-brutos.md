# Propuesta: Ingresos Brutos (alcance pendiente de definición)

Estado: **sin implementar y sin alcance definido.** En el testing se mencionó "automatizar Ingresos Brutos para reducir trabajo manual, sobre todo en clientes con ingresos recurrentes". No se especificaron jurisdicciones, regímenes ni operaciones, así que no se construyó nada.

## Qué hay hoy en el código

- **Nada específico de Ingresos Brutos**: ningún modelo, cálculo, alícuota ni jurisdicción. Un `grep` de "ingresos brutos" o "IIBB" en `src/` no devuelve resultados.
- **Lo que podría reutilizarse:**
  - comprobantes por contribuyente (`Invoice`), como base imponible por período;
  - vencimientos cargados por el estudio (`Obligation`). Hoy se pueden cargar vencimientos de IIBB a mano, como cualquier obligación, con su estado de pago;
  - solicitudes y documentos, para pedir y guardar constancias o declaraciones juradas;
  - el patrón de escalas versionadas (`src/modules/fiscal/scales.ts`), para tablas de alícuotas por vigencia.

## Por qué no se implementa sin más datos

Ingresos Brutos es provincial. Aplicar "una alícuota a cada factura" sería incorrecto en muchos casos, porque el cálculo depende de:
- la jurisdicción;
- el régimen;
- la actividad (nomenclador provincial);
- las deducciones, retenciones y percepciones sufridas;
- los mínimos;
- el sistema de presentación y pago de cada provincia.

## Definiciones necesarias

1. **Jurisdicciones**: ¿qué provincias tienen los clientes del estudio? ¿Hay contribuyentes de Convenio Multilateral?
2. **Régimen por cliente**:
   - **Régimen Simplificado**: por ejemplo, en muchas provincias se integra con el monotributo y se paga una cuota fija por categoría.
   - **Régimen general (local)**: declaraciones juradas con base imponible y alícuota.
   - **Convenio Multilateral**: coeficientes unificados y presentación por SIFERE.
3. **Fuente de datos**: ¿alcanzan los comprobantes que ya tiene ContadorSmart? ¿Hace falta importar otros, como ventas fuera del sistema o retenciones y percepciones?
4. **Cálculo**: alícuota por actividad y jurisdicción, con vigencias; deducciones; mínimos; redondeos. ¿Quién mantiene esas tablas?
5. **Presentaciones**: ¿ContadorSmart solo prepara un borrador para que el estudio presente, o se busca presentar? La presentación automática requiere integraciones provinciales y quedaría fuera de alcance por ahora.
6. **Pagos**: ¿solo se informa el importe y el vencimiento (como hoy con `Obligation`), o se genera el volante de pago?
7. **Revisión del estudio**: toda liquidación propuesta debería pasar por la aprobación del estudio antes de mostrarse al cliente como definitiva.

## Primer paso sugerido (bajo riesgo), una vez definido el punto 2

- **Régimen Simplificado:** mostrar la cuota fija vigente por categoría, cargada por el estudio en tablas versionadas como las escalas, y el vencimiento como `Obligation`.
- **Régimen general:** un "papel de trabajo" mensual con la base imponible del período (suma de comprobantes) y la alícuota que cargó el estudio, marcado como borrador para revisión. Sin presentar ni pagar.

# Bloqueos temporales por mesa

Implementado el 6 de noviembre de 2026 después de mesas, horarios y excepciones. Usa los endpoints existentes, sin modificar backend, permisos ni migraciones.

## Uso

1. Ingresar como STAFF asignado a una sucursal activa o como ADMIN y abrir **Mesas**.
2. Elegir sucursal y pulsar **Bloqueos temporales** en la mesa correspondiente.
3. Usar **Nuevo bloqueo**, completar inicio, fin y motivo obligatorio (3–500 caracteres). Para cruzar medianoche, elegir la fecha siguiente en el fin.
4. Pulsar **Revisar bloqueo**, comprobar las fechas y horas y luego **Confirmar bloqueo**.
5. Para liberar ese intervalo, elegir **Retirar bloqueo** y confirmar. No se modifica el estado general de la mesa.

La lista muestra inicio, fin y motivo, ordenados por inicio y paginados de a 10. Incluye registros pasados, que ya no ocupan fechas futuras. Hay carga, error, reintento, actualización manual y estado vacío. Cerrar el panel descarta una edición sin confirmar; al guardar, se actualizan el listado y la disponibilidad. La sucursal y la paginación de mesas se mantienen bloqueadas mientras el panel está abierto para evitar mezclar contextos.

ADMIN puede preparar bloqueos en sucursales inactivas sin reactivarlas. STAFF no puede consultar ni cambiar bloques de otra sucursal, mesa o asignación; CUSTOMER no tiene acceso a la sección. Los datos privados se aíslan por cuenta, sucursal y mesa, y la API vuelve a verificar permisos en cada solicitud.

## Fechas, horarios y conflictos

Las entradas de fecha y hora representan valores civiles de `BUSINESS_CONFIG.timezone` (`America/Argentina/Tucuman`), independientemente de la zona del navegador. La web los convierte a ISO UTC con `date-fns-tz`, igual que las conversiones de servicios del backend. No se usa un offset fijo ni `new Date(datetimeLocal)` sin zona.

La conversión rechaza fechas inválidas y horas inexistentes por cambios horarios mediante comprobación de ida y vuelta. Para horas históricas ambiguas se conserva la resolución de la biblioteca; no hay selector explícito de offset. La interfaz usa precisión de minutos. No se exige que un intervalo sea futuro: se conservan las posibilidades de la API actual.

Fin debe ser posterior a inicio. Los intervalos son semiabiertos `[inicio, fin)`: pueden tocarse en un extremo. El servidor rechaza cruces con otro bloqueo o una reserva CONFIRMED/ATTENDED solapada. Un rechazo no crea el bloqueo ni modifica la reserva. No hay reintento automático de POST ante errores de red; si el alta queda incierta, se bloquea su reenvío y se ofrece cerrar y revisar el listado.

Un bloqueo temporal es distinto de `tableStatus = BLOCKED`. Retirarlo no cambia BLOCKED ni OUT_OF_SERVICE; tampoco cancela reservas ni elimina otros bloqueos. La disponibilidad vuelve a evaluar todas sus condiciones, incluidos capacidad y horarios. No se modifica el estado de las mesas automáticamente al comenzar o terminar un intervalo.

## API y límites

Todas las rutas usan `/api/v1/staff/branches/:branchId/tables/:tableId/blocks`:

- GET con `page` y `limit`: consulta paginada.
- POST con `{ "startAt": "...Z", "endAt": "...Z", "reason": "Mantenimiento" }`: crea.
- DELETE `/:blockId`: retira el bloqueo de esa mesa.

La API no tiene edición de intervalos: para corregir uno hay que retirarlo y crear otro, revisando ambos resultados. La retirada elimina el registro y no tiene deshacer ni auditoría de actor nueva; el backend conserva su contrato. Un reintento de una retirada ya aplicada puede devolver 404, sin afectar otro bloqueo. Si varias personas crean intervalos simultáneamente, la API coordina la escritura y rechaza los solapamientos.

La vista actual no tiene búsqueda por rango ni un calendario gráfico. Para encontrar intervalos fuera de la página actual, navegar por las páginas ordenadas. Los bloqueos son por mesa; no se añadió cierre de sucursal ni bloqueo masivo.

## Instalación y comprobaciones

Se declaran en la web `date-fns@4.4.0` y `date-fns-tz@3.2.0`, versiones ya empleadas en el monorepo. Tras actualizar otra instalación, ejecutar `pnpm.cmd install --frozen-lockfile` y `pnpm.cmd build`; no hay migración nueva. Vite preoptimiza `date-fns-tz` para evitar una recarga inicial al abrir por primera vez el panel de bloqueos en desarrollo.

Se agregaron tres pruebas de conversión de fechas y horas. Total de pruebas unitarias: 17 de API y 11 de web. El recorrido de bloqueos en escritorio/móvil usa un navegador con zona `Pacific/Auckland`: comprueba el UTC persistido en PostgreSQL, fin inválido, motivo obligatorio, cruce de medianoche, disponibilidad, extremos contiguos, conflictos, retirada sin reactivar una mesa bloqueada, reserva protegida, alta con respuesta perdida, paginación, recarga, alcance por sucursal y acceso ADMIN a una inactiva. Las pruebas usan y eliminan solo datos temporales propios.

Comandos: `pnpm.cmd --filter @repo/web build`, `pnpm.cmd test`, `pnpm.cmd lint`, `pnpm.cmd --filter @repo/web test:e2e` y `git diff --check`. No ejecutar pruebas contra producción.

Resultado: compilación y tipos correctos, 28 pruebas automatizadas y doce recorridos Playwright aprobados en total (seis recorridos, cada uno en escritorio y móvil). Se revisaron las capturas de bloqueos y niveles; las estrellas no alteran las reglas de puntos. El punto de continuación es revisar sesiones, almacenamiento y coordinación entre pestañas antes de producción.

# Mesas, horarios y bloqueos

Implementado el 28 de octubre de 2026. Todas las rutas operativas requieren Bearer token y el prefijo `/api/v1/staff/branches/:branchId`. ADMIN tiene acceso global, incluso a sucursales inactivas. STAFF puede consultar y configurar únicamente sucursales activas asignadas. CUSTOMER no puede acceder.

## Rutas

| Recurso | Consulta | Alta | Cambio | Eliminación |
| --- | --- | --- | --- | --- |
| Mesas | GET `/tables` | POST `/tables` | PATCH `/tables/:tableId` | No disponible; cambiar estado |
| Bloqueos | GET `/tables/:tableId/blocks` | POST `/tables/:tableId/blocks` | No disponible; retirar y recrear | DELETE `/tables/:tableId/blocks/:blockId` |
| Horarios | GET `/schedules` | POST `/schedules` | PATCH `/schedules/:scheduleId` | DELETE `/schedules/:scheduleId` |
| Excepciones | GET `/schedule-exceptions` | POST `/schedule-exceptions` | PATCH `/schedule-exceptions/:exceptionId` | DELETE `/schedule-exceptions/:exceptionId` |

Mesas, bloqueos y excepciones aceptan `page` y `limit` y devuelven `{ data, meta }`, como sucursales. Horarios devuelve un arreglo de hasta siete elementos. Identificadores UUID; los IDs de otro recurso o sucursal no permiten modificar registros ajenos. PATCH requiere al menos un campo permitido; números de mesa, fechas de excepciones y días de horarios son inmutables.

Errores: 400 para datos inválidos, 401 sin autenticación, 403 sin rol o asignación, 404 para recursos inexistentes o ajenos y 409 para duplicados o solapamientos.

## Mesas

POST `/tables`:

```json
{ "tableNumber": "A-1", "capacity": 4 }
```

Capacidad entera entre 1 y 50. Número entre 1 y 10 caracteres alfanuméricos o guiones; único por sucursal y sensible a mayúsculas. La mesa nace ACTIVE. No se admite cambiar el número por PATCH ni reutilizarlo en otra mesa de la misma sucursal.

PATCH `/tables/:tableId`:

```json
{ "capacity": 6, "tableStatus": "OUT_OF_SERVICE" }
```

Estados: ACTIVE (operativa), BLOCKED (bloqueo administrativo persistente) y OUT_OF_SERVICE (fuera de servicio). No hay campo redundante `isActive`. Modificar el estado no elimina bloqueos temporales. No hay eliminación permanente por HTTP ni traslado de mesas entre sucursales.

## Horario semanal

POST `/schedules`:

```json
{
  "dayOfWeek": 1,
  "openingTime": "22:00",
  "closingTime": "02:00",
  "reservationIntervalMinutes": 30,
  "isActive": true
}
```

Días ISO: 1 lunes a 7 domingo. Un servicio por día semanal; no se implementan aún turnos separados de almuerzo y cena. Horas locales HH:MM entre 00:00 y 23:59. Si cierre es anterior a apertura, termina el día siguiente. Apertura igual a cierre se rechaza: no representa un servicio de 24 horas. El intervalo de futuras reservas está entre 15 y 120 minutos y es 30 por defecto.

Un día sin horario activo no inicia servicio. Puede tener aún el final del servicio nocturno anterior. `isActive: false` conserva la configuración; DELETE la elimina. Se rechazan servicios activos superpuestos, incluidos domingo y lunes. Se pueden tocar sus extremos.

## Excepciones por fecha

POST `/schedule-exceptions` para cerrar el servicio de una fecha:

```json
{ "date": "2026-12-25", "isClosed": true, "reason": "Feriado" }
```

Para reemplazarlo por un horario especial:

```json
{
  "date": "2026-12-24",
  "openingTime": "18:00",
  "closingTime": "23:00",
  "reason": "Horario especial"
}
```

Una excepción por sucursal y fecha local YYYY-MM-DD; prevalece sobre el horario semanal. Puede abrir un día sin servicio habitual. Al cerrarla se limpian sus horas; reabrirla requiere enviar apertura y cierre. No se expone el motivo interno en la consulta pública.

La fecha identifica el servicio que comienza ese día. Por ejemplo, cerrar el servicio del martes no corta a medianoche el servicio del lunes 22:00–02:00. Para evitar también ese tramo, modificar el servicio del lunes mediante otra excepción. Una excepción abierta usa el intervalo del horario semanal activo de su día, o 30 minutos si no lo hay.

Se comprueba el estado final de cambios parciales y la compatibilidad con servicios de fechas contiguas. Borrar una excepción puede devolver 409 si restaurar el horario semanal provocaría un solapamiento; en ese caso no se borra. Horarios y excepciones se actualizan bajo bloqueo transaccional por sucursal.

## Consulta pública del servicio

`GET /api/v1/branches/:branchId/hours?date=2026-11-02`

Disponible sin login para sucursales activas. Devuelve `date`, `timezone`, `source` (WEEKLY, EXCEPTION o NONE), `isClosed`, `reservationIntervalMinutes` y `window` con `startAt`/`endAt` UTC, o null si no inicia servicio. Un lunes 22:00–02:00 en `America/Argentina/Tucuman` devuelve martes 01:00Z–05:00Z. No consulta disponibilidad ni incorpora bloqueos en esta respuesta.

Se usa `BUSINESS_CONFIG.timezone` de `@repo/config`; no la zona del navegador o servidor. Fechas y horas semanales permanecen como valores civiles; los bloqueos son instantes PostgreSQL `timestamptz`. La conversión de una hora local inexistente por un cambio horario se rechaza. Horas ambiguas históricas siguen la resolución de la biblioteca; no hay selector explícito de offset para horarios semanales.

## Bloqueos temporales

POST `/tables/:tableId/blocks`:

```json
{
  "startAt": "2026-11-02T20:00:00-03:00",
  "endAt": "2026-11-02T22:00:00-03:00",
  "reason": "Mantenimiento"
}
```

Se exige offset o Z y fin posterior al inicio. El motivo tiene de 3 a 500 caracteres. La respuesta usa UTC. El intervalo es `[inicio, fin)`: un bloqueo puede comenzar exactamente al terminar otro. Se serializan las altas por sucursal y mesa para impedir superposiciones y coordinar con reservas. Es posible registrar un bloqueo fuera del horario de atención o en una mesa no operativa.

DELETE retira el bloqueo indicado; repetirlo devuelve 404. Cambiarlo requiere retirarlo y crear uno nuevo. No hay restricciones de fecha futura ni limpieza automática de bloqueos antiguos. Un bloqueo que se superponga con una reserva confirmada se rechaza con 409.

## Protección de reservas

Los controles de ocupación y protección de configuración incluyen CONFIRMED y ATTENDED. Marcar asistencia no permite asignar otra reserva o bloqueo a esa mesa dentro del intervalo original. NO_SHOW ya no ocupa la mesa.

La etapa de [reservas](RESERVAS.md) coordina operaciones mediante bloqueo de la sucursal. Se rechazan cambios de horario o excepciones que dejen reservas confirmadas vigentes fuera del servicio; también reducir capacidad por debajo del grupo o poner fuera de operación una mesa que tenga reservas confirmadas aún no terminadas. El intervalo de turnos puede cambiar sin alterar las reservas que ya estaban confirmadas, siempre que sigan dentro de la ventana del servicio. Cancelar o resolver las reservas afectadas antes de aplicar cambios incompatibles.

## Verificación

La migración agrega mesas, horarios, excepciones y bloqueos sin borrar datos anteriores, con claves foráneas y controles básicos de capacidad e intervalos. Las reglas de solapamiento se aplican en las transacciones de la API; escribir directamente en la base puede eludirlas.

Ejecutar los comandos del README: compilación, pruebas, lint, validación Prisma e integración real. La integración prueba números duplicados, capacidad y estado, IDs de otra sucursal, horas nocturnas en UTC, excepciones, cambios inválidos con rollback y altas concurrentes de horarios y bloqueos. Sus datos se eliminan al finalizar por las relaciones con las sucursales temporales.

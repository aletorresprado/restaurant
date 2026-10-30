# Registro de asistencia y ausencia

Primer avance de la etapa 5, 30 de octubre de 2026. Disponible en Swagger con autenticación STAFF asignado a la sucursal activa o ADMIN con acceso global. No requiere una nueva migración; reutiliza los estados y eventos existentes.

## Endpoint

`POST /api/v1/staff/branches/:branchId/reservations/:id/attendance`

```json
{ "outcome": "ATTENDED", "reason": "Cliente presente" }
```

Para ausencia:

```json
{ "outcome": "NO_SHOW", "reason": "No se presentó" }
```

`outcome` es obligatorio. `reason` es opcional; si se envía, requiere de 3 a 500 caracteres después de quitar espacios externos. IDs UUID; campos adicionales se rechazan. Se devuelve el detalle de la reserva con su estado e historial actualizados.

## Reglas

- Solo una reserva CONFIRMED puede recibir su primer resultado.
- ATTENDED se permite desde `startAt`, inclusive, según la hora del servidor. No hay check-in anticipado.
- NO_SHOW se permite desde `startAt` más `BUSINESS_CONFIG.attendance.noShowGracePeriodMinutes` (30 minutos), inclusive.
- Se admiten registros retrospectivos para cerrar reservas pasadas. No se ejecutan cambios automáticos por tiempo.
- Un resultado terminal no puede convertirse en el contrario ni modificarse desde este endpoint. No se registra asistencia sobre reservas canceladas.
- Repetir el mismo resultado devuelve 200 sin otro evento ni reemplazo del motivo original.
- Estado y evento se guardan en la misma transacción bajo bloqueo de sucursal. Dos resultados opuestos simultáneos producen un éxito y un 409.
- ATTENDED registra ATTENDANCE_CONFIRMED; NO_SHOW registra NO_SHOW_RECORDED. El evento conserva actor, momento y motivo opcional.
- ATTENDED ocupa la mesa hasta el `endAt` original, en disponibilidad y validaciones de bloqueos, capacidad, estado, horarios y desactivación. NO_SHOW libera la mesa.

Errores: 400 para datos inválidos, 401 sin autenticación, 403 sin rol o asignación, 404 para recursos inexistentes/ajenos y 409 para horario prematuro o transición no permitida. No hay correcciones administrativas de asistencia ni liberación anticipada de mesas ocupadas.

## Alcance y continuación

El frontend del cliente ya interpreta ATTENDED y NO_SHOW, pero la acción del personal se realiza por Swagger hasta construir sus pantallas. La asistencia no genera puntos ni penalizaciones en esta entrega.

El siguiente paso es el historial de puntos con aplicación única por evento, saldo, nivel y ajustes administrativos. Debe definirse cómo tratar los eventos anteriores a esa activación y las correcciones auditables sin duplicar movimientos. La etapa 5 sigue abierta.

## Verificación

Validación del avance: build completo, 23 pruebas aprobadas (17 de API y 6 de web), chequeo de tipos e integración real PostgreSQL. Los dos recorridos de navegador del frontend estaban aprobados para el commit anterior; no se cambiaron sus pantallas en este avance.

Pruebas de frontera para el instante de inicio y los 30 minutos exactos; integración PostgreSQL con permisos, ausencia prematura, reservas canceladas, reintentos concurrentes, resultados opuestos y preservación/liberación de ocupación. Los fixtures se crean en una sucursal temporal propia y se eliminan al terminar. No ejecutar la integración contra producción.

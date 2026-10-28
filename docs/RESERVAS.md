# Disponibilidad y reservas

Implementado el 28 de octubre de 2026. Prefijo común `/api/v1`. Requiere las migraciones de sucursales, operación y reservas.

## Recorrido desde Swagger

1. Como administrador o personal asignado, configurar una sucursal activa, mesas ACTIVE y horarios o una excepción para una fecha futura. Ver [OPERACION.md](OPERACION.md).
2. Consultar sin login `GET /branches/:branchId/availability?date=2026-11-02&partySize=4`, usando la fecha real deseada. El campo `date` identifica el inicio del servicio local, también si cruza medianoche.
3. Iniciar sesión con CUSTOMER, autorizar su `accessToken` y usar uno de los `startAt` devueltos:

```json
{
  "branchId": "UUID-DE-LA-SUCURSAL",
  "serviceDate": "2026-11-02",
  "startAt": "2026-11-02T20:00:00-03:00",
  "partySize": 4
}
```

4. Enviar a `POST /reservations`. Confirmar ID, mesa asignada, estado CONFIRMED y evento RESERVATION_CREATED. Las fechas de ejemplo solo funcionan si son futuras y coinciden con el servicio configurado.
5. Consultar `GET /reservations` o `GET /reservations/:id` con el mismo usuario.
6. Para cancelar, enviar `{}` o `{ "reason": "Cambio de planes" }` a `POST /reservations/:id/cancel`, con al menos 6 horas de anticipación.
7. Como personal asignado, consultar `GET /staff/branches/:branchId/reservations?date=2026-11-02`. Para cancelación del restaurante, enviar `{ "reason": "Cierre extraordinario" }` a `POST /staff/branches/:branchId/reservations/:id/cancel` antes del inicio.

## Contrato y permisos

| Método | Ruta | Acceso |
| --- | --- | --- |
| GET | `/branches/:branchId/availability` | Público, sucursal activa; `date` y `partySize` obligatorios |
| POST | `/reservations` | CUSTOMER, reserva para sí mismo |
| GET | `/reservations` | Autenticado, solo propias; `page` y `limit` |
| GET | `/reservations/:id` | Autenticado, solo propia |
| POST | `/reservations/:id/cancel` | Propietario, política de cliente |
| GET | `/staff/branches/:branchId/reservations` | STAFF asignado / ADMIN; fecha de servicio obligatoria y paginación |
| GET | `/staff/branches/:branchId/reservations/:id` | STAFF asignado / ADMIN, misma sucursal |
| POST | `/staff/branches/:branchId/reservations/:id/cancel` | STAFF asignado / ADMIN, motivo obligatorio |

Los listados de reservas devuelven `{ data, meta }`, 20 por página por defecto y máximo 100. Incluyen reservas canceladas. La agenda muestra datos básicos de contacto del cliente y las reservas que comienzan en la fecha de servicio, no todas las que toquen esa fecha civil. El detalle incluye eventos; nunca hashes de contraseña o sesiones. Pedir una reserva ajena por la ruta de cliente devuelve 404, incluso si quien consulta es administrador. Para acceso administrativo se usan las rutas de sucursal.

## Asignación y disponibilidad

- Grupos entre 1 y 50 personas; duración fija actual de 120 minutos desde `BUSINESS_CONFIG`.
- Una mesa por reserva, sin combinaciones. Prioridad: menor capacidad suficiente, luego número de mesa y UUID. No se admite `tableId`, `userId`, duración ni estado enviados por el cliente.
- Solo se ofrecen mesas ACTIVE de sucursales activas. Horarios, excepciones, bloqueos y reservas CONFIRMED determinan la disponibilidad.
- Se generan turnos desde la apertura, separados por `reservationIntervalMinutes`. El inicio debe ser futuro y coincidir exactamente con la grilla; la duración completa debe caber dentro del servicio. Se admite terminar exactamente al cierre.
- Los instantes de inicio enviados requieren offset o Z; se almacenan y responden en UTC. La zona y la fecha de servicio siguen las reglas de operación.
- La consulta devuelve `date`, `partySize`, `timezone`, `durationMinutes` y `slots`, con `startAt`, `endAt` y `availableTables`. No expone identidades de clientes ni IDs de mesas libres.
- Una fecha sin servicio, un grupo sin capacidad o un servicio sin turnos libres devuelve `slots: []`. Una sucursal inactiva o inexistente devuelve 404.
- Consultar no bloquea cupo. La confirmación vuelve a comprobarlo bajo transacción y puede devolver 409 si el turno se agotó.

## Concurrencia y cambios operativos

La API serializa confirmaciones, cancelaciones y cambios operativos relevantes mediante bloqueo de la fila de sucursal. Evita reservas superpuestas para una misma mesa y carreras entre alta de bloqueo y confirmación. La disponibilidad usa una instantánea consistente, pero puede quedar desactualizada después de responder.

Horarios y excepciones no pueden dejar reservas confirmadas vigentes fuera de su ventana. Bloqueos no pueden superponerse con reservas confirmadas. Mesas no pueden pasar a BLOCKED/OUT_OF_SERVICE ni reducir capacidad por debajo de los grupos de sus reservas vigentes. Una sucursal con reservas confirmadas aún no terminadas no puede desactivarse. Las reservas no se cancelan automáticamente por cambios de configuración.

Son garantías de las rutas de la API; las escrituras SQL directas pueden eludir las comprobaciones de solapamiento. La migración aplica claves foráneas y controles de intervalo y tamaño de grupo. No se requieren extensiones PostgreSQL ni permisos de superusuario para migrar.

## Cancelaciones y eventos

- El propietario cancela con al menos 6 horas de anticipación, inclusive el límite exacto. No se aplica todavía una penalización: fuera del plazo se rechaza con 403.
- El restaurante puede cancelar antes del inicio con un motivo de 3 a 500 caracteres. Una reserva iniciada devuelve 409.
- Estados resultantes: CANCELLED_BY_CUSTOMER o CANCELLED_BY_RESTAURANT. La mesa queda libre al confirmar la cancelación.
- Se registra un evento con actor, fecha y motivo opcional del cliente u obligatorio del restaurante. La creación registra RESERVATION_CREATED con estado inicial CONFIRMED.
- Repetir la misma clase de cancelación devuelve la reserva sin duplicar eventos. Intentar otra transición desde una reserva ya cancelada devuelve 409.

## Límites y próxima etapa

No se implementan reprogramación, elección de mesa por el cliente, reserva por cuenta de otro usuario, límites de reservas por persona, notificaciones, pagos, lista de espera ni una clave de idempotencia para creación. Un reintento de creación puede reservar otra mesa si queda cupo: consultar las reservas propias antes de repetir una petición cuyo resultado se desconoce.

Las reservas aún no cambian automáticamente a ATTENDED o NO_SHOW. Esos estados y los puntos de fidelización pertenecen a la próxima etapa. Los clientes conservan acceso a sus reservas aunque una sucursal posteriormente deje de estar activa.

## Validación

15 pruebas automatizadas cubren configuración, identidad, sesiones, zona horaria y límites de reservas. La integración contra PostgreSQL comprueba las cuatro etapas y añade última mesa con solicitudes simultáneas, carrera bloqueo/reserva, asignación por capacidad, privacidad, agenda, horarios nocturnos, extremos contiguos, cancelación dentro y fuera de plazo y rechazo de cambios operativos incompatibles.

Ejecutar los comandos del README. La integración prepara exclusivamente usuarios y sucursales temporales y elimina sus reservas y eventos al finalizar. No usar producción.

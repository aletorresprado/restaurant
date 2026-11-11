# Reservas sin duplicados por reintentos

Implementado el 11 de noviembre de 2026. Requiere la migración `20261111000100_reservation_operations` y reconstruir la API y la web.

## Uso desde la web

1. Elegir sucursal, fecha, grupo y horario. Continuar e ingresar con una cuenta CUSTOMER.
2. Confirmar una vez. Antes del primer envío se guarda el intento, con UUID y datos originales.
3. Si se interrumpe la conexión, la pantalla muestra **Verificar y reintentar**. No reenvía automáticamente la solicitud.
4. Recargar o volver a ingresar con la misma cuenta conserva el intento. El aviso **Retomar confirmación** permite recuperarlo desde cualquier pantalla de la app.
5. Verificar y reintentar envía la misma operación: si ya se guardó, recupera esa reserva; si no llegó al servidor, intenta crearla con las reglas y disponibilidad actuales.
6. Otra pestaña de la misma cuenta observa el intento pendiente. No lo reemplaza con otro horario mientras esté sin resolver. Si dos pestañas reintentan a la vez, el servidor devuelve la misma reserva.

La recuperación devuelve el estado actual. Una reserva cancelada o con asistencia/ausencia no se reactiva; la web abre su detalle. Si otra pestaña ya completó el intento, se ofrece **Ver reserva** sin generar otra operación.

Si la API rechaza definitivamente el intento por datos, sucursal o cupo (400/404/409), se libera la confirmación pendiente para elegir otro horario. Si falla la conexión, hay un error 5xx, o no puede verificarse la cuenta, se conserva el intento original. Un error de autenticación requiere volver a ingresar con su cuenta. Nunca resolver un error incierto generando otro UUID.

## Contrato de la API

`POST /api/v1/reservations` acepta `operationId`, UUID del cliente, junto con `branchId`, `serviceDate`, `startAt` y `partySize`. Swagger lo documenta. El propietario se toma de la sesión, nunca del cuerpo.

```json
{
  "operationId": "7e79ae10-e259-4778-b2f5-1c7d092c3017",
  "branchId": "UUID-DE-LA-SUCURSAL",
  "serviceDate": "2026-12-01",
  "startAt": "2026-12-01T20:00:00-03:00",
  "partySize": 2
}
```

- El primer envío válido crea una reserva y un evento. `operationId` se guarda en la misma transacción.
- Repetir el UUID con la misma cuenta y los mismos datos devuelve la misma reserva, con su estado actual, y no agrega eventos. `startAt` se compara como instante: offsets equivalentes son iguales.
- Usar ese UUID con otros datos devuelve 409. Se comprueba antes de volver a resolver disponibilidad, horario, fecha futura o actividad de la sucursal.
- La misma operación se serializa con un bloqueo asesor transaccional de PostgreSQL, seguido del bloqueo de sucursal existente. El identificador del bloqueo normaliza el UUID y no toma un bloqueo de usuario que invierta el orden de los procesos de fidelización. Un índice único `(userId, operationId)` agrega protección de integridad.
- Una cuenta distinta puede usar el mismo UUID para su propia reserva, sin leer la ajena. Otra operación con otro UUID puede crear otra reserva; no hay una nueva restricción global de reservas idénticas por cliente.
- Un intento rechazado que no creó una reserva no consume el UUID. Un reintento se evalúa de nuevo y puede confirmar si se resolvió el impedimento.
- El POST conserva HTTP 201 tanto en creación como en recuperación. Se devuelve el estado actual, no una respuesta histórica congelada.
- `operationId` es opcional para clientes antiguos y reservas históricas. **Sin UUID no hay protección contra reenvíos**; la web siempre lo envía. No inferir idempotencia comparando solamente fecha y personas.

## Persistencia del navegador y límites

El registro pendiente se guarda en `localStorage` bajo una clave por ID de usuario (`app-resto-reservation-intent:<id>`). Contiene UUID, sucursal, fecha, grupo e inicio/fin; nunca contraseñas ni tokens. Al completar o rechazar definitivamente se elimina, sin conservar historial local de fechas/grupos. El UUID de una selección copiada permite recuperar la misma operación en la API aunque otra pestaña ya haya eliminado el registro. La sesión usa cookies HttpOnly según [SESIONES-WEB.md](SESIONES-WEB.md), sin tokens en sessionStorage.

Web Locks coordina la lectura/escritura breve del registro entre pestañas del mismo origen. No se mantiene el bloqueo durante la petición HTTP: PostgreSQL resuelve los envíos concurrentes. Si no hay Web Locks, o no se puede leer/guardar el registro, la confirmación no se envía. En desarrollo usar localhost y un navegador actualizado; en producción HTTPS. Un login sin Web Locks todavía puede funcionar en memoria, pero no confirmar desde esta interfaz.

Cambiar de cuenta no muestra ni reutiliza los intentos de la anterior. Los registros se mantienen al salir para permitir recuperarlos al volver a ingresar. Son datos de uso de la cuenta en ese navegador: conservar esta limitación de privacidad en equipos compartidos. `localStorage` y `sessionStorage` siguen accesibles a JavaScript del mismo origen; esta entrega no cierra la revisión de XSS/CSP, cookies y privacidad de producción.

La protección depende de reutilizar la operación original. Borrar el almacenamiento, cambiar de navegador/dispositivo, elegir deliberadamente otra operación o enviar el POST antiguo sin UUID puede producir otra reserva. Revisar Mis reservas antes de recrear manualmente una confirmación cuyo UUID se perdió. No se deduplican automáticamente dos reservas independientes. No hay retención/limpieza automática del registro del navegador; en la base, la clave dura mientras exista la reserva, incluidos sus estados terminales. Eliminar registros de la base elimina su capacidad de reconocimiento.

## Instalación y comprobaciones

En otra instalación, desde la raíz y con la API detenida si Windows bloquea Prisma:

```powershell
pnpm.cmd --filter @repo/api db:generate
pnpm.cmd --filter @repo/api db:deploy
pnpm.cmd build
pnpm.cmd dev
```

La séptima migración agrega una columna nullable y un índice único; no modifica reservas anteriores, roles, horarios, reglas de asignación, cancelación ni puntos. Ya se aplicó en la base local de desarrollo. No requiere servicios o dependencias adicionales.

Pruebas unitarias del registro: reutilización, inmutabilidad, separación por cuenta, resultados completados, descarte por identificador y fallo seguro de almacenamiento/compatibilidad. Integración PostgreSQL: envíos concurrentes incluso con UUID en mayúsculas, identidad de respuesta, un evento, conflictos de contenido, separación de propietarios, otra operación válida, cancelación, sucursal inactiva, rechazo sin consumir UUID y recuperación histórica. Navegador: respuesta perdida después del commit, recarga sin reenvío, login de otra cuenta, recuperación al volver, dos pestañas reintentando, fallo antes de llegar al servidor y almacenamiento bloqueado.

Los tests usan recursos temporales propios y los eliminan. No ejecutarlos contra producción. La recuperación se comprueba interceptando la respuesta de prueba, sin modificar la red del usuario ni sus cuentas.

Validación local: build completo, tipos, esquema Prisma, 39 pruebas unitarias e integración PostgreSQL ampliada. Los dieciocho recorridos de navegador quedaron verificados; en la corrida general, bloqueos de escritorio tuvo un fallo de conexión y aprobó al repetirlo por separado. La primera ejecución que inició servidores temporales necesitó liberar sus procesos al terminar en Windows; la corrida general reutilizó los servicios de desarrollo. Ninguno de estos incidentes se ocultó mediante reintentos automáticos del producto.

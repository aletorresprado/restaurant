# Recuperación de altas y ajustes administrativos

Implementado el 11 de noviembre de 2026. Complementa la recuperación de reservas; las reglas de permisos, horarios, ocupación y puntos se conservan.

## Desde la web

Las altas de sucursales, mesas, horarios semanales, excepciones y bloqueos guardan el intento antes del primer POST. Si falla la conexión, el formulario sigue ofreciendo **Cerrar y revisar** y aparece **Operaciones pendientes** debajo del menú. No se reenvía automáticamente.

1. Abrir **Operaciones pendientes** en cualquier pantalla con la misma cuenta de personal/administración.
2. Revisar tipo de alta, sucursal/mesa o cliente y datos originales. El destino se consulta con los permisos actuales.
3. Presionar **Verificar y reintentar**. Si el alta ya se guardó, se devuelve el registro actual; si nunca llegó al servidor, se intenta crear con las reglas actuales.
4. Los listados se actualizan y el pendiente se elimina al recuperar el resultado. Si quedó abierto el formulario original con el aviso anterior, cerrarlo para volver al listado.

Recargar, volver a ingresar o abrir otra pestaña de la misma cuenta no pierde el identificador. Dos pestañas que recuperan ese pendiente envían la misma operación, sin duplicar registros. Un pendiente de otro usuario no se muestra ni se usa. No iniciar una operación nueva para resolver un resultado incierto; recuperar primero la existente.

Si el registro fue creado y después eliminado, el servidor devuelve 410 y la web informa el resultado sin recrearlo. Si cambió después del alta (por ejemplo capacidad de una mesa o actividad de sucursal), recuperar devuelve su estado actual sin deshacer esa edición.

## Ajustes de puntos

**Revisar ajuste** guarda un borrador compartido por administrador y cliente. Las otras pestañas muestran los mismos puntos/motivo y no permiten editar ese borrador. **Volver a editar** o **Descartar borrador** lo retira de todas las pestañas mientras todavía no se haya intentado enviar.

Después de presionar **Confirmar ajuste**, UUID y contenido quedan fijos hasta conocer el resultado. Puede recuperarse seleccionando otra vez al cliente o desde **Operaciones pendientes**, que consulta su nombre/correo antes de habilitar la confirmación. Un resultado incierto no se descarta ni se convierte en otra operación. Dos recuperaciones del mismo UUID devuelven el movimiento original, sin volver a aplicar puntos.

El propietario confirmó manualmente el recorrido con un borrador de +2 puntos en dos pestañas: ambas mostraron **Ajuste pendiente de confirmación** y **Volver a editar** retiró el borrador de ambas, permitiendo ingresar otra vez puntos/motivo. Esa revisión/cancelación no aplica puntos; la escritura requiere confirmar explícitamente.

Los ajustes pendientes de la versión anterior se migran desde sessionStorage cuando se selecciona ese cliente. La copia anterior se elimina solo después de guardar el registro compartido. Si ya existe otro pendiente con datos diferentes, se conserva la copia antigua y se informa el conflicto para revisión; no se sobrescribe.

La API comprueba también el autor de un ajuste existente. Otro administrador que intente reutilizar su UUID recibe 409, sin reaplicar ni apropiarse del movimiento. Los UUID se comparan sin distinguir mayúsculas/minúsculas, incluso para claves históricas guardadas en mayúsculas; no se reescribe el historial ni se recalculan saldos. UUID distintos representan ajustes deliberados distintos.

## API de altas

Estos POST aceptan la cabecera opcional **Idempotency-Key**, un UUID por operación, documentada en Swagger:

| Alta | Ruta con prefijo `/api/v1` |
| --- | --- |
| Sucursal | `/admin/branches` |
| Mesa | `/staff/branches/:branchId/tables` |
| Horario semanal | `/staff/branches/:branchId/schedules` |
| Excepción | `/staff/branches/:branchId/schedule-exceptions` |
| Bloqueo | `/staff/branches/:branchId/tables/:tableId/blocks` |

La clave se vincula al usuario autenticado. Un bloqueo asesor de PostgreSQL serializa la misma clave y cuenta; el registro de operación y el alta se confirman en una sola transacción. Se guarda tipo, destino, hash SHA-256 del cuerpo validado y UUID del resultado, sin copiar direcciones, motivos u otro cuerpo completo en el registro de operaciones. Las claves se normalizan a minúsculas y el orden de propiedades del JSON no afecta el hash.

- Repetir clave, tipo, destino y datos devuelve el mismo recurso actual, HTTP 201, sin volver a ejecutar el alta.
- Cambiar datos, tipo o destino devuelve 409 con `code: OPERATION_MISMATCH`; la web conserva el pendiente para revisión.
- Si el resultado fue eliminado, devuelve 410; el intento no lo vuelve a crear.
- Un rechazo sin alta confirmada no consume la clave: la transacción revierte también su registro.
- Los permisos se verifican antes de consultar/recuperar: perder la asignación a una sucursal impide recuperar sus recursos como personal.
- Sin cabecera se conserva el contrato antiguo, sin garantía contra reenvíos. La web siempre la utiliza para estas altas.

Los ajustes conservan su UUID en el cuerpo y su movimiento auditado existente; no usan otra tabla para reaplicar puntos. `OPERATION_MISMATCH` se utiliza también para cambios de contenido/autor de esos ajustes. Para mostrar el destino del pendiente se agregan lecturas de usuario por ID (solo ADMIN) y mesa por ID (personal autorizado en esa sucursal), sin hashes ni credenciales.

## Persistencia y límites

El navegador mantiene solo pendientes bajo `app-resto-management:<actorId>:<ruta>`, en localStorage. Incluyen UUID, ruta, datos originales y si ya se intentó enviar. Web Locks coordina la lectura/escritura breve entre pestañas; la petición HTTP queda protegida por la transacción del servidor. Sin almacenamiento o Web Locks se impide el envío, en lugar de mandar un POST sin registro recuperable.

Resolver o rechazar definitivamente (400/404/409 sin conflicto de clave, o 410) elimina ese pendiente. Errores de conexión, servidor, autenticación, permisos o clave con datos diferentes lo conservan. El borrado compara UUID para no eliminar un intento más nuevo. Cerrar sesión conserva los pendientes para recuperar con su cuenta; no son un historial local. En equipos compartidos, salir explícitamente y resolver los intentos pendientes: sus datos de gestión/motivos son legibles por JavaScript del mismo origen. Las sesiones continúan en cookies HttpOnly, sin tokens en estos registros.

La garantía corresponde al mismo UUID original y cuenta. Operaciones nuevas deliberadas, borrar almacenamiento, usar otro origen/navegador/dispositivo sin la clave o clientes antiguos sin cabecera no se deduplican por semejanza de contenido. No hay envío automático en segundo plano. PATCH/PUT/DELETE mantienen su contrato; no se incorpora control de versiones ni resolución de ediciones concurrentes en esta entrega. Las cargas de imágenes siguen siendo reemplazos del único archivo de la sucursal y no se guardan binarios en el registro del navegador.

Los registros de operación de la base permanecen aunque se elimine el recurso; eliminarlos eliminaría la capacidad de reconocer ese UUID. Se borran en cascada al eliminar la cuenta autora. La retención debe decidirse al preparar producción, sin limpiar claves todavía necesarias para recuperación.

## Instalación y validación

La novena migración `20261111000300_management_operations` crea WriteOperation; ya está aplicada en desarrollo. Conservar `.env`; si Windows bloquea Prisma, detener la API y ejecutar:

```powershell
pnpm.cmd --filter @repo/api db:generate
pnpm.cmd --filter @repo/api db:deploy
pnpm.cmd build
pnpm.cmd dev
```

No agrega servicios externos ni dependencias. La integración PostgreSQL cubre las cinco altas concurrentes, UUID en mayúsculas, conflictos de datos/destino/tipo, estado actual editado, resultados eliminados, rollback, aislamiento de autores y permisos retirados. Incluye ajustes con claves históricas en mayúsculas y rechazo de otro autor.

Las pruebas unitarias del navegador cubren borradores compartidos, inmutabilidad, separación de cuentas, almacenamiento bloqueado, UUID idéntico al reintentar, limpieza selectiva y cambio de sesión antes del envío. El recorrido real reproduce respuesta perdida después del commit, fallo antes del servidor, recarga, otra cuenta, dos pestañas y revisión/cancelación/recuperación de puntos. Usa recursos temporales propios; no ejecutarlo contra producción.

Validado: compilación del monorepo, tipos, esquema Prisma, 49 pruebas unitarias (20 API + 29 web), integración PostgreSQL ampliada y veinte recorridos de navegador aprobados (diez en escritorio y diez en móvil). Se revisó visualmente el panel y la ausencia de desbordamiento. Después de esa suite solo se añadieron aclaraciones de privacidad en los textos y se retiraron imports sin uso; la compilación final e integración volvieron a aprobar. La etapa 6 queda completada en desarrollo local; no reemplaza el entorno de preproducción ni los controles de la etapa 7.

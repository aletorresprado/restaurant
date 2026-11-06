# Horarios semanales y excepciones desde la web

Implementado el 6 de noviembre de 2026 como siguiente etapa después de Mesas. Usa los endpoints y reglas de la API existentes; no agrega migraciones, dependencias ni servicios externos.

## Acceso

Iniciar los servicios con `pnpm.cmd dev`, ingresar a la app y abrir **Horarios** en el menú superior (`/horarios`). ADMIN también puede ir desde **Administración → Sucursales → Gestionar horarios**; Mesas tiene un enlace a Horarios de la misma sucursal.

ADMIN configura cualquier sucursal, incluidas las inactivas. STAFF solo ve y modifica sus sucursales activas asignadas. CUSTOMER no tiene acceso. Sin sesión se ofrece ingresar y se vuelve a Horarios para STAFF/ADMIN. La API valida los permisos en cada solicitud; un ID de sucursal ajena en la URL no concede acceso ni se reemplaza silenciosamente por otro.

La selección de sucursal se conserva en `/horarios?sucursal=<UUID>` al recargar. Los formularios se aíslan por cuenta y sucursal. Mientras hay una edición o confirmación abierta no se cambia de sucursal desde el selector; la navegación hacia otra sucursal descarta la edición anterior, sin guardado automático.

## Horarios semanales

1. Pulsar **Nuevo horario** y elegir un día de lunes a domingo. Hay como máximo un registro por día y sucursal; los días ya configurados se editan en su tarjeta, aunque estén inactivos.
2. Completar apertura y cierre en HH:MM e intervalo entero de turnos de 15 a 120 minutos. El intervalo no es la duración de una reserva, que continúa siendo 120 minutos.
3. Guardar con **Guardar horario**. Apertura y cierre iguales son inválidos. Un cierre menor a la apertura termina al día siguiente: lunes 22:00–02:00 termina el martes.
4. Para cambiar datos, usar **Editar horario**; el día queda fijo. Desactivar conserva la configuración y pide confirmación. Reactivar vuelve a usarla, sujeto a los controles de la API.
5. **Eliminar horario** pide confirmación y borra el registro semanal. Puede dejar el día sin servicio, pero las excepciones existentes conservan prioridad.

Se muestran los días sin servicio semanal activo, que todavía pueden tener una excepción abierta o el final nocturno del servicio anterior. No hay servicios separados de almuerzo y cena ni interpretación de apertura igual a cierre como 24 horas. Una ventana menor a la duración de la reserva puede ser válida como configuración y no ofrecer turnos.

## Excepciones por fecha

1. Pulsar **Nueva excepción** y elegir la fecha de inicio del servicio en la zona del restaurante.
2. Para un cierre, marcar **No inicia servicio en esta fecha** y guardar; se pide confirmar el cierre. Para apertura especial, dejarlo desmarcado y completar apertura y cierre.
3. El motivo es opcional e interno, con máximo 500 caracteres. Puede vaciarse al editar; no se expone en la consulta pública.
4. Editar conserva la fecha. Cerrar una excepción borra sus horas en la API; reabrir requiere completar nuevamente apertura y cierre.
5. **Eliminar excepción** pide confirmación. Restaura el horario semanal activo del día o deja la fecha sin servicio si no existe uno.

Cada fecha admite una excepción por sucursal. La excepción sustituye todo el servicio iniciado ese día y puede abrir un día sin horario semanal. Usa el intervalo del horario semanal activo correspondiente o 30 minutos si no lo hay; no tiene intervalo propio.

Cerrar el servicio del martes no corta un lunes de 22:00 a 02:00: ese tramo pertenece al lunes. Para modificarlo, cambiar también el servicio o excepción del lunes. La interfaz lo explica y muestra cuándo el cierre cae al día siguiente. No convierte las horas usando la zona del navegador: envía fechas y horas civiles y la API aplica `BUSINESS_CONFIG.timezone`.

La lista de excepciones está ordenada por fecha y paginada de a 10. No hay filtro de fecha en esa lista todavía. Para comprobar el resultado de una fecha concreta se usa la consulta siguiente.

## Consulta del servicio efectivo

**Consultar servicio por fecha** llama al endpoint público de horarios. Muestra el origen (semanal, excepción o sin horario), inicio y fin con fecha y hora en la zona del restaurante, e intervalo. No calcula una simulación local ni representa cupo de mesas. La vista se actualiza después de cambios; para sucursales inactivas se informa que estará disponible al reactivarlas.

La respuesta no muestra motivos internos. Un resultado sin servicio se expresa como **No inicia servicio en esta fecha**, para distinguirlo del tramo nocturno anterior.

## Conflictos, errores y persistencia

La API rechaza solapamientos semanales, incluidos domingo/lunes y servicios nocturnos, y excepciones que se crucen con servicios contiguos. También rechaza cambios, cierres o eliminaciones que dejen reservas CONFIRMED/ATTENDED con fin pendiente fuera del servicio. El cambio se revierte transaccionalmente: no se cancelan ni modifican esas reservas.

Eliminar una excepción también puede devolver 409 si restaurar el horario semanal provoca un solapamiento. Se conserva el registro y se muestra el motivo para corregir primero la otra configuración. Hay errores visibles y reintento de consultas; **Actualizar horarios** vuelve a consultar los datos. Después de cualquier modificación se invalidan horarios, excepciones, servicio efectivo y disponibilidad para obtener el estado real del servidor.

Los PATCH envían solo campos modificados. No hay control de versiones: si varias personas cambian el mismo campo, prevalece el último cambio aceptado. Si se pierde la respuesta de un alta o falla con estado incierto, se bloquea su reenvío y se ofrece cerrar y revisar antes de repetir. No hay reintentos automáticos de escrituras ante errores de red; la unicidad por día/fecha de la API sigue vigente. Una eliminación ya aplicada puede devolver 404 al repetirla: revisar el listado actualizado.

## API utilizada y continuación

Con prefijo `/api/v1`, STAFF asignado/ADMIN usan GET/POST `/staff/branches/:branchId/schedules` y `/schedule-exceptions`, y PATCH/DELETE con el identificador del registro. Las excepciones aceptan `page` y `limit`. La vista efectiva usa GET público `/branches/:branchId/hours?date=YYYY-MM-DD`. Ver [OPERACION.md](OPERACION.md) para el contrato completo.

La siguiente parte pendiente de la configuración operativa es **bloqueos temporales por mesa**. Siguen disponibles por Swagger. Después quedan revisión de sesiones y seguridad/preparación productiva; esta entrega no completa esas etapas.

## Verificación

Compilación web, chequeo de tipos y las 25 pruebas de API/web existentes. Recorridos Playwright de escritorio y móvil contra PostgreSQL: retorno tras login, permisos, sucursal inactiva para ADMIN, altas/edición/desactivación/reactivación/eliminación, igualdad de horas, medianoche e intervalos, solapamientos y extremos contiguos, excepciones cerradas y reapertura con horas obligatorias, borrado que restauraría un solapamiento, reservas protegidas, alta con respuesta de red perdida, paginación, recarga y consulta pública sin motivos internos. Las pruebas crean y eliminan solo datos temporales propios.

Comandos: `pnpm.cmd --filter @repo/web build`, `pnpm.cmd test`, `pnpm.cmd lint`, `pnpm.cmd --filter @repo/web test:e2e` y `git diff --check`. No ejecutar pruebas contra producción.

Resultado de la entrega: compilación y tipos correctos, las 25 pruebas existentes y diez recorridos Playwright aprobados (cinco recorridos en escritorio y sus equivalentes en móvil). Se conservan las pruebas previas de clientes, fidelización, imágenes y mesas. Se revisaron las capturas de escritorio/móvil y la ausencia de desbordamiento horizontal.

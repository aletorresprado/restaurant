# Gestión de mesas desde la web

Implementado el 6 de noviembre de 2026, según el punto de reanudación del plan. Usa la API existente, los esquemas compartidos y el diseño adaptado de Lovable. No agrega dependencias, migraciones ni servicios externos y no cambia las reglas de reservas.

## Acceso y permisos

Con los servicios iniciados (`pnpm.cmd dev`), ingresar a la app y abrir **Mesas** en el menú superior. ADMIN también puede usar **Administración → Sucursales → Gestionar mesas**, que lleva directamente a la sucursal elegida.

- ADMIN puede configurar mesas de todas las sucursales, incluidas las inactivas. Esto no reactiva la sucursal ni habilita reservas por sí solo.
- STAFF solo puede configurar mesas de sus sucursales activas asignadas.
- CUSTOMER no ve el enlace y recibe acceso denegado si abre `/mesas` directamente.
- Sin sesión se ofrece ingresar y se vuelve a Mesas después del login de STAFF/ADMIN.

La selección está en `/mesas?sucursal=<UUID>` y se conserva al recargar. Un identificador válido de una sucursal fuera del alcance muestra un aviso sin consultar sus mesas ni sustituirla silenciosamente por otra. La API aplica nuevamente autenticación, rol y asignación a cada solicitud. Las listas y formularios se aíslan por cuenta y sucursal.

## Recorrido

1. Elegir **Sucursal de las mesas**. La lista se ordena por número y se consulta de a 10 mesas con Anterior/Siguiente. Hay carga, error, reintento, actualización manual y estado vacío.
2. Pulsar **Nueva mesa**, completar un número (hasta 10 letras, números o guiones) y una capacidad entera de 1 a 50. Guardar con **Crear mesa**. Las nuevas mesas nacen activas.
3. Usar **Editar mesa** para cambiar capacidad o estado. El número queda fijo; no se envía en PATCH. Se envían solo los campos modificados, para que un cambio de capacidad no restablezca inadvertidamente un estado cambiado por otra persona.
4. Al pasar a Bloqueada o Fuera de servicio, revisar la advertencia y pulsar **Confirmar cambio de estado**. Para volver a Activa, seleccionarla y guardar.
5. Si el servidor rechaza la operación, el formulario conserva los datos y muestra el motivo. Se vuelve a consultar el listado para comprobar el estado real.

Mientras un formulario está abierto, se pausa el cambio de sucursal y de página dentro de la sección para evitar envíos al contexto equivocado. Cancelar edición no guarda. La navegación del navegador hacia otra sucursal descarta el formulario anterior; no hay guardado automático.

| Estado | Resultado |
| --- | --- |
| Activa (`ACTIVE`) | Operativa; la disponibilidad también considera capacidad, horarios, reservas y bloqueos por fecha. No significa que esté libre ahora. |
| Bloqueada (`BLOCKED`) | No se ofrece para nuevas reservas hasta reactivarla. Es un estado persistente, sin fecha de fin. |
| Fuera de servicio (`OUT_OF_SERVICE`) | No se ofrece para nuevas reservas; conserva la mesa y su historial. |

La API impide reducir la capacidad por debajo del grupo de una reserva CONFIRMED o ATTENDED con fin pendiente, o pasar esa mesa a un estado distinto de ACTIVE. El conflicto se muestra sin cancelar ni modificar reservas. Una mesa activa necesita una sucursal activa y un servicio configurado para ofrecer turnos. La ocupación y los resultados de las reservas se consultan en Agenda.

## API utilizada

Todas requieren STAFF con asignación activa o ADMIN, con prefijo `/api/v1`:

- `GET /staff/branches/:branchId/tables?page=1&limit=10`.
- `POST /staff/branches/:branchId/tables`, con `{ "tableNumber": "A-1", "capacity": 4 }`.
- `PATCH /staff/branches/:branchId/tables/:tableId`, solo `capacity` y/o `tableStatus`.

El número es único dentro de la sucursal; el mismo número puede existir en otra. La API rechaza un ID de mesa de otra sucursal, campos extra, capacidad inválida y números duplicados. Si se pierde la respuesta del alta, el formulario bloquea su reenvío y ofrece **Cerrar y revisar mesas**. No se crean mesas automáticamente ni se reintentan altas ante errores de red. Revisar el número y la página correspondiente antes de iniciar otra operación.

## Límites y continuación

No hay eliminación permanente, renumeración ni traslado entre sucursales; usar Fuera de servicio cuando corresponda. Tampoco hay plano visual, combinación de mesas, operaciones masivas o auditoría nueva de cambios de capacidad/estado. La API no ofrece control de versiones de edición: si dos personas cambian el mismo campo, prevalece la última operación aceptada.

La gestión de [horarios semanales y excepciones](HORARIOS-WEB.md) ya está disponible, con enlace desde Mesas hacia la misma sucursal. Los bloqueos temporales siguen pendientes en la web; sus endpoints se pueden usar desde Swagger. Ver [OPERACION.md](OPERACION.md). No confundir Bloqueada con un bloqueo por intervalo de fechas.

## Validación

Compilación web y chequeo de tipos; 25 pruebas de API/web existentes. Recorridos Playwright de mesas contra PostgreSQL en escritorio y móvil: login de retorno, vacío, capacidad inválida, alta, duplicado, estado inicial, número inmutable, edición de capacidad/estado, disponibilidad pública, conservación de un cambio concurrente de estado, rechazo por reservas CONFIRMED/ATTENDED, alta con respuesta perdida sin duplicación, paginación, recarga, aislamiento de sucursales, acceso ADMIN a una inactiva y rechazo CUSTOMER. Se comprueba que navegar hacia otra sucursal con un formulario abierto no guarde ni conserve la edición anterior. Las pruebas crean y eliminan solo sus usuarios y sucursales temporales; no ejecutarlas contra producción.

Resultado: compilación y tipos correctos, 25 pruebas existentes y ocho recorridos de navegador aprobados (cliente, administración, sucursales y mesas, cada uno en escritorio y móvil). Se conservan las pruebas de imágenes y de fidelización.

Comandos: `pnpm.cmd --filter @repo/web build`, `pnpm.cmd test`, `pnpm.cmd lint`, `pnpm.cmd --filter @repo/web test:e2e` y `git diff --check`.

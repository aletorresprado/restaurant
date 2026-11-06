# Plan de desarrollo de App Resto

Actualizado: 6 de noviembre de 2026.

## Objetivo

Construir un sistema de reservas y fidelización para un restaurante con varias sucursales, con una API persistente y una interfaz para clientes y personal.

## Estado y recorrido restante

Las etapas 1 a 5 están implementadas y verificadas en desarrollo local. La etapa 5 incorpora movimientos de puntos, saldo, niveles, encuestas y ajustes auditados. La etapa 6 integra el diseño de Lovable al recorrido real del cliente, agenda del personal y administración de usuarios, asignaciones y puntos. No hay despliegue productivo. Faltan los formularios de configuración operativa y la revisión de sesiones (6), y la preparación del despliegue (7).

La [hoja de ruta a producción](PRODUCCION.md) desglosa esos pendientes, las decisiones del propietario y los criterios para publicar. Tener el código subido a GitHub o Swagger accesible localmente no completa la etapa de despliegue.

## Método de trabajo

1. Tomar la primera etapa pendiente y revisar sus dependencias.
2. Implementar el flujo completo de esa etapa, incluyendo validación, permisos y persistencia.
3. Ejecutar las comprobaciones apropiadas y documentar qué se verificó y qué quedó pendiente.
4. Actualizar siempre `README.md` y el estado de este plan según los cambios reales.
5. Revisar el diff y comprobar que no haya secretos antes del commit y el push.

No marcar una etapa como terminada solo por tener tipos, dependencias o esquemas de validación. Deben existir endpoints y comportamiento verificado. Las decisiones todavía abiertas se resuelven al iniciar su etapa, antes de depender de ellas.

## 1. Persistencia y autenticación — completada

- [x] PostgreSQL con usuario de aplicación sin privilegios de administración.
- [x] Modelos Prisma de usuarios y sesiones, y migración inicial versionada.
- [x] Registro público de clientes, login y perfil autenticado.
- [x] Contraseñas con hash; refresh tokens aleatorios almacenados como hash.
- [x] Renovación de sesión de un solo uso y logout.
- [x] Comando explícito para crear un administrador inicial.
- [x] Validación de configuración y documentación Swagger.
- [x] Pruebas automatizadas con datos simulados y prueba de integración contra PostgreSQL real.

Validado: compilación, chequeo de tipos, esquema Prisma, 11 pruebas automatizadas y prueba real de registro, login, perfil, persistencia, rotación concurrente, logout y rechazo de usuarios desactivados. PostgreSQL local y Swagger accesibles en el equipo de desarrollo.

Límites actuales: no hay recuperación de contraseña, verificación de correo, límite de intentos de login, revocación inmediata del access token ni limpieza programada de sesiones vencidas. El administrador inicial no se crea automáticamente.

## 2. Permisos y sucursales — completada

- [x] Autorización para `CUSTOMER`, `STAFF` y `ADMIN`, usando el rol actual de la base.
- [x] Personal limitado a sus sucursales activas asignadas; administrador con alcance global.
- [x] Modelos `Branch` y `BranchStaff`, con migración incremental aplicada localmente.
- [x] Consulta pública de sucursales activas y administración de altas, cambios y desactivación.
- [x] Asignación y retiro de personal, consulta administrativa de usuarios y cambio CUSTOMER/STAFF.
- [x] Rutas protegidas, validación de coordenadas y documentación Swagger.
- [x] Pruebas contra PostgreSQL de permisos, persistencia, aislamiento y cambios de rol con tokens existentes.

Decisiones: desactivar conserva asignaciones; bajar a CUSTOMER las elimina. No se crean ni modifican administradores desde la API de roles. La asignación y el cambio de rol bloquean la fila del usuario para coordinar solicitudes concurrentes. La consulta pública no requiere login y no expone personal. Ver [SUCURSALES.md](SUCURSALES.md).

Validación: compilación, 11 pruebas existentes, chequeo de tipos, esquema Prisma e integración real ampliada. Las pruebas de integración crean y eliminan exclusivamente sus usuarios y sucursales temporales.

Criterio de cierre: un administrador gestiona sucursales; un cliente consulta las disponibles y recibe un rechazo al intentar modificarlas. Pruebas de permisos y persistencia aprobadas.

## 3. Mesas, horarios y bloqueos — completada

- [x] Mesas por sucursal, capacidad 1–50, número inmutable único y estados operativos.
- [x] Horario semanal por día ISO, excepciones por fecha y bloqueos temporales.
- [x] Zona del restaurante para fechas de servicio y ventanas UTC, incluido cruce de medianoche.
- [x] Permisos por sucursal para ADMIN y STAFF asignado; rechazo de IDs de otra sucursal.
- [x] Validación de estado final en PATCH y solapamientos semanales, excepciones y bloqueos.
- [x] Migración aplicada, restricciones de integridad y transacciones para solicitudes concurrentes.
- [x] Compilación, 13 pruebas, chequeo de tipos, esquema Prisma e integración real ampliada.

Decisiones: un servicio por día de semana; la fecha identifica el inicio del servicio. Una excepción reemplaza ese servicio y no recorta el del día anterior. Intervalos semiabiertos permiten extremos contiguos. No hay eliminación de mesas por HTTP: se usa OUT_OF_SERVICE. Detalles y límites en [OPERACION.md](OPERACION.md).

Criterio de cierre: el personal autorizado configura capacidad y horarios; la API rechaza intervalos inválidos y operaciones fuera de su alcance. Migraciones y pruebas aprobadas.

## 4. Disponibilidad y reservas — completada

- [x] Duración de 120 minutos, grupos 1–50 y una mesa por reserva, asignación por capacidad suficiente más pequeña.
- [x] Disponibilidad pública por fecha de servicio, horarios, excepciones, capacidad, estado, bloqueos y reservas confirmadas.
- [x] Confirmación transaccional y coordinación con cambios operativos mediante bloqueo por sucursal.
- [x] Reservas propias, detalle e historial; agenda y detalle para personal autorizado.
- [x] Cancelación del cliente con al menos 6 horas y del restaurante antes del inicio, con actor y motivo cuando corresponde.
- [x] Protección de reservas frente a bloqueos y cambios de capacidad, estado, horario o desactivación.
- [x] Migración aplicada, compilación, 15 pruebas, tipos, esquema e integración PostgreSQL con concurrencia.

Decisiones: no se combinan mesas ni se permite elegir una mesa concreta desde el cliente. La consulta no retiene cupo. Cancelar libera la mesa; repetir la misma cancelación no duplica eventos. No hay reprogramación, reservas por cuenta de terceros ni notificaciones. Detalles en [RESERVAS.md](RESERVAS.md).

Criterio de cierre: un cliente completa una reserva real y puede consultarla o cancelarla según la política. Dos solicitudes simultáneas no pueden reservar la misma mesa en intervalos superpuestos. Cubrir horarios límite y zona horaria.

## 5. Asistencia y fidelización — completada

- [x] Asistencia desde el inicio y ausencia después de la tolerancia configurada, mediante endpoint de personal autorizado.
- [x] Eventos con actor y motivo opcional, idempotencia y rechazo de resultados opuestos concurrentes.
- [x] Preservar ocupación hasta el fin de una reserva ATTENDED; liberar mesa ante NO_SHOW.
- [x] Pruebas de tiempos, permisos y concurrencia contra PostgreSQL. Sin migración nueva: estados y eventos ya existían.
- [x] Persistir transacciones de puntos con trazabilidad y aplicación única por evento.
- [x] Calcular saldo y nivel usando las reglas compartidas, sin saldo negativo.
- [x] Implementar ajustes administrativos con motivo, autor y UUID de operación para reintentos.
- [x] Encuesta de calificación 1–5, propia, una vez por reserva con asistencia y finalizada; recompensa +2.
- [x] Activación sin recalcular asistencias/ausencias históricas; reconocimiento anterior mediante ajustes explícitos.
- [x] Quinta migración aplicada e integración real de puntos, niveles, encuestas y ajustes con concurrencia.

Decisiones: asistencia manual desde la agenda web o Swagger; no se admite corregir un resultado terminal ni registrar asistencia anticipada. Puntos +1/+2/−3 con mínimo cero y nivel calculado según saldo actual. No hay canjes ni vencimiento. Ver [ASISTENCIA.md](ASISTENCIA.md) y [FIDELIZACION.md](FIDELIZACION.md). Correcciones de estados y automatización de ausencias quedan como mejoras separadas; los ajustes administrativos corrigen puntos.

Criterio de cierre: los eventos generan los puntos esperados una sola vez, incluso con reintentos; el cliente consulta su saldo e historial y el administrador puede auditar ajustes.

## 6. Interfaz de clientes y personal — en curso

- [x] Web adaptable en `apps/web`, basada en el diseño de Lovable y conectada a nuestra API.
- [x] Registro/login, restauración y renovación de sesión y logout para la integración local.
- [x] Sucursales reales, fecha de servicio, grupo, disponibilidad y confirmación sin cambiar reglas de negocio.
- [x] Reservas propias, detalle, eventos y cancelación, con carga, errores y estados vacíos.
- [x] Pruebas de cliente HTTP y recorrido de navegador en escritorio y móvil contra PostgreSQL.
- [ ] Política de sesión entre pestañas y revisión del almacenamiento antes de producción.
- [x] Consulta de asistencia en detalle, saldo/nivel/historial en Mis reservas y encuesta tras una visita finalizada.
- [x] Agenda de sucursales autorizadas, asistencia, ausencia, cancelación e historial desde la web.
- [x] Administración de usuarios CUSTOMER/STAFF, asignaciones y fidelización con ajustes auditados y reintentos seguros en la misma pestaña.
- [x] Formularios de alta/edición/activación/desactivación de sucursales, con validaciones compartidas, conflictos por reservas vigentes y tratamiento de altas con respuesta incierta.
- [x] Imagen propia por sucursal: selección, vista previa, carga/reemplazo/borrado ADMIN, persistencia PostgreSQL y tarjetas del inicio con respaldo general.
- [x] Gestión web de mesas por sucursal autorizada: listado paginado, alta, capacidad, estados, confirmación y errores por reservas vigentes.
- [x] Horarios semanales y excepciones desde la web: altas, edición, cierres/desactivación/eliminación con confirmación, servicio por fecha y conflictos de la API.
- [ ] Formularios de bloqueos temporales por mesa.

Decisiones: SPA React/Vite con TanStack Router, sin servicios Lovable ni un segundo backend. Se conserva el estilo visual, pero se eliminan datos ficticios y funciones que nuestra API no ofrece. Ver [FRONTEND.md](FRONTEND.md) para procedencia y [GESTION-WEB.md](GESTION-WEB.md) para agenda, administración y verificación. La etapa 6 sigue abierta por configuración operativa y revisión de sesiones.

Criterio de cierre: los recorridos principales funcionan desde la interfaz contra la API real, con estados de carga, errores, acceso por rol y uso en pantallas pequeñas.

## 7. Preparación del primer despliegue — pendiente

1. Agregar límites de intentos de autenticación, CORS por dominio y HTTPS.
2. Resolver recuperación de contraseña y verificación de correo; elegir proveedor solo si hace falta.
3. Definir limpieza de sesiones vencidas, logs operativos y comprobación de disponibilidad de la base.
4. Configurar integración continua para compilación, pruebas y migraciones en una base aislada.
5. Elegir hosting, presupuesto, secretos, copias de seguridad y procedimiento de restauración.
6. Validar migraciones y recorridos completos en un entorno de prueba antes de publicar.

Criterio de cierre: despliegue reproducible con configuración separada, respaldo y restauración comprobados, permisos verificados y monitoreo básico. La elección de cuentas o servicios pagos se confirma con el propietario antes de contratar.

Seguir la lista detallada de [PRODUCCION.md](PRODUCCION.md), que incluye seguridad de autenticación, reconciliación de reintentos de reserva, CI, entorno de prueba, migraciones, restauración y validación del primer lanzamiento. Todos esos controles de publicación siguen pendientes.

## Punto de reanudación — actualizado el 6 de noviembre de 2026

Entrega actual: fidelización persistente, agenda/administración web, sucursales con imágenes propias y gestión de mesas, horarios y excepciones. El propietario confirmó el acceso ADMIN y probó sucursales y mesas. Documentación en [FIDELIZACION.md](FIDELIZACION.md), [GESTION-WEB.md](GESTION-WEB.md), [IMAGENES-SUCURSALES.md](IMAGENES-SUCURSALES.md), [MESAS-WEB.md](MESAS-WEB.md) y [HORARIOS-WEB.md](HORARIOS-WEB.md). Se conserva la lógica de reservas, permisos y ocupación. No hay servicios externos nuevos ni despliegue productivo.

Para retomar, seguir este orden:

La próxima entrega comienza con **bloqueos temporales por mesa desde la web**: intervalos de fechas/horas en la zona del restaurante, consulta, alta y retirada, con los controles existentes de solapamiento y reservas. La etapa 6 permanece abierta hasta completarlos y revisar las sesiones antes de producción.

1. Iniciar `pnpm.cmd dev` y comprobar el acceso con una cuenta ADMIN. Si no existe, ejecutar el comando interactivo de `GESTION-WEB.md`; no promover cuentas directamente en la base ni guardar credenciales en Git.
2. Probar **Administración → Sucursales**: altas, edición y activación/desactivación ya implementadas. Una sucursal nueva no ofrece turnos hasta configurar mesas y horarios.
3. Probar **Mesas** y **Horarios**: alta, capacidad, estados, servicios semanales, excepciones y consulta efectiva ya implementados. Continuar con bloqueos temporales por mesa. Mantener zona del restaurante, cruce de medianoche y validaciones de la API.
4. Ampliar los recorridos de navegador para esa configuración, incluyendo permisos, conflictos y pantallas pequeñas. Actualizar README y este plan con cada entrega.
5. Resolver sesiones/operaciones entre pestañas y continuar con los controles de producción de la etapa 7. No marcar la etapa 6 completa antes de cubrir los formularios pendientes y su verificación.

Verificado al 4 de noviembre: compilación del monorepo, tipos, 17 pruebas de API y 8 de web, integración PostgreSQL ampliada con imágenes y seis recorridos Playwright (cliente, gestión y sucursales, escritorio y móvil). Incluyen fotos propias del inicio, recarga, reemplazo/borrado, conflictos de desactivación, alta incierta y ajuste con respuesta perdida sin duplicar movimientos. La sexta migración `20261104000100_branch_images` se aplicó localmente. Sin dependencias ni servicios externos adicionales. Las fotos se incluyen en los respaldos de la base; revisar volumen/optimización al preparar producción.

Verificado al 6 de noviembre: compilación web, tipos, las 25 pruebas de API/web y diez recorridos de navegador aprobados (cliente, gestión, sucursales, mesas y horarios, escritorio/móvil). Mesas incluye disponibilidad, conflictos CONFIRMED/ATTENDED, permisos, paginación y conservación de cambios concurrentes. Horarios incluye medianoche, intervalos, cierres/reapertura, solapamientos, borrado de excepciones que restauraría un conflicto, reservas protegidas y alta con respuesta incierta. Solo se modificó la interfaz y su documentación, sin backend ni migraciones nuevas. Detalles en [MESAS-WEB.md](MESAS-WEB.md) y [HORARIOS-WEB.md](HORARIOS-WEB.md).

También se corrigió la restauración demorada de perfil al cambiar de cuenta: una respuesta de la cuenta anterior no sobrescribe la nueva. El recorrido de gestión reproduce ese caso con una respuesta retenida; esto no resuelve todavía la coordinación de sesiones entre pestañas.

Límites que deben conservarse visibles: resultados de asistencia definitivos, ausencia manual, historial anterior sin recalcular automáticamente, sin canjes ni vencimiento de puntos, sin coordinación de ajustes entre pestañas y sin recuperación/verificación de correo. Ver la hoja de ruta antes de publicar.

## Comandos de comprobación

Desde la raíz del repositorio:

```powershell
pnpm.cmd build
pnpm.cmd test
pnpm.cmd lint
pnpm.cmd --filter @repo/api exec prisma validate
pnpm.cmd --filter @repo/api test:integration
pnpm.cmd --filter @repo/web test:e2e
git diff --check
```

La integración necesita una base de desarrollo migrada y crea y elimina sus propios usuarios, sesiones y sucursales temporales. Nunca usar una base de producción para esta prueba. Consultar `README.md` para preparar la conexión y aplicar las migraciones.

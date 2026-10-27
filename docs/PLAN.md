# Plan de desarrollo de App Resto

Actualizado: 27 de octubre de 2026.

## Objetivo

Construir un sistema de reservas y fidelización para un restaurante con varias sucursales, con una API persistente y una interfaz para clientes y personal.

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

## 2. Permisos y sucursales — pendiente, próxima etapa

1. Implementar y probar autorización para `CUSTOMER`, `STAFF` y `ADMIN`.
2. Definir si el personal tiene acceso a todas las sucursales o únicamente a las asignadas.
3. Crear modelos y migraciones de sucursales y asignaciones, si corresponden.
4. Implementar consulta de sucursales activas y administración de altas, cambios y desactivación.
5. Proteger las operaciones administrativas y documentarlas en Swagger.

Criterio de cierre: un administrador gestiona sucursales; un cliente consulta las disponibles y recibe un rechazo al intentar modificarlas. Pruebas de permisos y persistencia aprobadas.

## 3. Mesas, horarios y bloqueos — pendiente

1. Definir mesas por sucursal, capacidad, estado y reglas de desactivación.
2. Implementar horarios de atención, excepciones por fecha y bloqueos de mesas.
3. Usar la zona horaria del restaurante al interpretar horarios y UTC para instantes persistidos.
4. Validar intervalos, pertenencia a sucursal y restricciones por rol.

Criterio de cierre: el personal autorizado configura capacidad y horarios; la API rechaza intervalos inválidos y operaciones fuera de su alcance. Migraciones y pruebas aprobadas.

## 4. Disponibilidad y reservas — pendiente

1. Definir duración, tamaño del grupo y política de selección o combinación de mesas.
2. Consultar disponibilidad considerando horarios, capacidad, bloqueos y reservas existentes.
3. Crear reservas confirmadas con control transaccional de concurrencia.
4. Implementar consulta de reservas propias y agenda del personal autorizado.
5. Aplicar cancelación del cliente y del restaurante, con registro de eventos.

Criterio de cierre: un cliente completa una reserva real y puede consultarla o cancelarla según la política. Dos solicitudes simultáneas no pueden reservar la misma mesa en intervalos superpuestos. Cubrir horarios límite y zona horaria.

## 5. Asistencia y fidelización — pendiente

1. Registrar asistencia y ausencia con la tolerancia configurada.
2. Persistir transacciones de puntos con trazabilidad y aplicación única por evento.
3. Calcular saldo y nivel usando las reglas compartidas, sin saldo negativo.
4. Implementar ajustes administrativos con motivo y autor.
5. Definir el alcance de encuestas y sus recompensas antes de implementarlas.

Criterio de cierre: los eventos generan los puntos esperados una sola vez, incluso con reintentos; el cliente consulta su saldo e historial y el administrador puede auditar ajustes.

## 6. Interfaz de clientes y personal — pendiente

1. Acordar web adaptable o aplicación móvil, pantallas y alcance del primer lanzamiento.
2. Implementar registro, login y manejo de sesión con almacenamiento de tokens apropiado a la plataforma elegida.
3. Implementar selección de sucursal, fecha, horario, disponibilidad y confirmación de reserva.
4. Implementar reservas propias, cancelaciones y consulta de fidelización.
5. Implementar agenda y administración para los roles autorizados.

Criterio de cierre: los recorridos principales funcionan desde la interfaz contra la API real, con estados de carga, errores, acceso por rol y uso en pantallas pequeñas.

## 7. Preparación del primer despliegue — pendiente

1. Agregar límites de intentos de autenticación, CORS por dominio y HTTPS.
2. Resolver recuperación de contraseña y verificación de correo; elegir proveedor solo si hace falta.
3. Definir limpieza de sesiones vencidas, logs operativos y comprobación de disponibilidad de la base.
4. Configurar integración continua para compilación, pruebas y migraciones en una base aislada.
5. Elegir hosting, presupuesto, secretos, copias de seguridad y procedimiento de restauración.
6. Validar migraciones y recorridos completos en un entorno de prueba antes de publicar.

Criterio de cierre: despliegue reproducible con configuración separada, respaldo y restauración comprobados, permisos verificados y monitoreo básico. La elección de cuentas o servicios pagos se confirma con el propietario antes de contratar.

## Comandos de comprobación

Desde la raíz del repositorio:

```powershell
pnpm.cmd build
pnpm.cmd test
pnpm.cmd lint
pnpm.cmd --filter @repo/api exec prisma validate
pnpm.cmd --filter @repo/api test:integration
git diff --check
```

La integración necesita una base de desarrollo migrada y crea y elimina su propio usuario temporal. Nunca usar una base de producción para esta prueba. Consultar `README.md` para preparar la conexión y aplicar las migraciones.

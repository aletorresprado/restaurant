# App Resto

Monorepo pnpm con API NestJS, validación Zod y tipos compartidos.

## Estado

Estado al 28 de octubre de 2026: API funcional en desarrollo local, con las etapas 1 a 4 completadas. El proyecto aún no está preparado para operar en producción y no tiene interfaz de usuario final.

- Identidad: registro, login, perfil, renovación y cierre de sesión con persistencia PostgreSQL/Prisma.
- Organización: permisos por rol, sucursales y asignaciones de personal, con permisos consultados en cada petición.
- Operación: mesas y estados, horarios semanales, excepciones y bloqueos, incluida conversión horaria y servicios nocturnos.
- Reservas: disponibilidad, asignación automática, reservas propias, agenda del personal y cancelaciones con eventos y control de concurrencia.

El registro público crea clientes; el administrador se crea mediante un comando explícito. Swagger permite probar la API durante el desarrollo.

La próxima etapa es **asistencia y fidelización**, seguida de la interfaz y la preparación del despliegue. Ver el [plan de desarrollo](docs/PLAN.md) y la [hoja de ruta a producción](docs/PRODUCCION.md), que detalla tareas, decisiones y criterios de publicación pendientes.

## Requisitos

- Node.js 22.19 o superior y pnpm 9.15.4.
- PostgreSQL 16 local, o Docker con Compose para usar `compose.yaml`.
- No hace falta una cuenta de un proveedor externo para desarrollo local.

En PowerShell se puede usar `pnpm.cmd` si la política de scripts bloquea `pnpm.ps1`.

## Inicio local

Desde la raíz:

```powershell
pnpm.cmd install --frozen-lockfile
docker compose up -d db
if (!(Test-Path apps/api/.env)) { Copy-Item apps/api/.env.example apps/api/.env }
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Si ya existe `.env`, conservarlo y editarlo en lugar de copiar encima. Pegar el secreto generado en `JWT_ACCESS_SECRET`. El `DATABASE_URL` del ejemplo coincide con la base de Compose. Si usás PostgreSQL instalado directamente, crear una base vacía y ajustar usuario, contraseña, puerto y nombre. Las credenciales de Compose son solo para desarrollo local.

```powershell
pnpm.cmd db:generate
pnpm.cmd --filter @repo/api db:deploy
pnpm.cmd build
pnpm.cmd --filter @repo/api start
```

Desarrollo con recarga: `pnpm.cmd dev` después de generar Prisma y compilar los paquetes compartidos. Si modificás un paquete compartido, volver a compilarlo para que la API reciba el cambio.

La API verifica las variables y conecta a PostgreSQL durante el arranque: sin una base accesible no inicia. No se crean tablas automáticamente; aplicar las migraciones antes de arrancar.

- Salud: http://localhost:3000/api/v1/health
- Swagger interactivo: http://localhost:3000/api/docs

Si la descarga del motor Prisma falla por certificados en Windows con Node 22.19+, probar `$env:NODE_USE_SYSTEM_CA='1'` antes de `pnpm.cmd db:generate`. No desactivar la validación TLS.

## Autenticación

Todos los endpoints llevan el prefijo `/api/v1/auth`:

| Método | Ruta | Datos |
| --- | --- | --- |
| POST | `/register` | firstName, lastName, email, password; phone opcional |
| POST | `/login` | email, password |
| POST | `/refresh` | refreshToken |
| POST | `/logout` | refreshToken |
| GET | `/me` | Header Authorization: Bearer accessToken |

Registro y login devuelven `user`, `accessToken` y `refreshToken`. La contraseña requiere al menos 8 caracteres, una mayúscula y un número; máximo 72 bytes por el límite de bcrypt. Correos normalizados a minúsculas. Nunca se devuelven hashes de contraseñas.

Al renovar, reemplazar ambos tokens en el cliente: el refresh anterior deja de funcionar. Logout revoca el refresh presentado; el access token sigue vigente hasta su expiración (15 minutos por defecto). No se implementa todavía revocación inmediata del access token ni logout de todos los dispositivos. Las sesiones vencidas se rechazan, pero aún no hay tarea de limpieza de sus registros.

## Administrador inicial

Configurar `ADMIN_EMAIL` y `ADMIN_PASSWORD` en `apps/api/.env` y ejecutar:

```powershell
pnpm.cmd build
pnpm.cmd db:seed
```

El comando crea un administrador y falla si ese correo ya existe; no eleva permisos de cuentas existentes. Quitar las variables de seed luego de usarlo.

## Sucursales y permisos

Ver [la guía de sucursales](docs/SUCURSALES.md) para el contrato de endpoints y el recorrido de administración en Swagger.

- Consulta pública: `GET /api/v1/branches` y `GET /api/v1/branches/:id`, solo sucursales activas.
- `ADMIN`: administra sucursales y asignaciones en `/api/v1/admin/branches`; consulta usuarios y cambia entre `CUSTOMER` y `STAFF` en `/api/v1/admin/users`.
- `STAFF`: consulta sus sucursales activas asignadas en `/api/v1/staff/branches`. No puede modificar sucursales ni asignarse por sí mismo.
- `CUSTOMER`: consulta la oferta pública; no accede a las rutas administrativas ni de personal.

Las listas de sucursales y usuarios aceptan `page` y `limit` (20 registros por defecto, máximo 100) y devuelven `{ data, meta }`. Las asignaciones se consultan en una lista propia por sucursal.

Desactivar una sucursal conserva sus datos y asignaciones; reactivarla permite nuevamente el acceso al personal asignado. Se rechaza la desactivación si tiene reservas confirmadas que aún no terminaron. Cambiar a una persona de `STAFF` a `CUSTOMER` elimina sus asignaciones. Los cambios de permisos tienen efecto con los tokens existentes. La API no permite crear ni modificar administradores mediante el endpoint de roles; se mantiene el comando de seed.

## Mesas, horarios y bloqueos

La [guía de operación](docs/OPERACION.md) detalla rutas, ejemplos y reglas de fechas. ADMIN puede configurar cualquier sucursal; STAFF solo sus sucursales activas asignadas.

- Mesas: `/api/v1/staff/branches/:branchId/tables`, número único por sucursal, capacidad entre 1 y 50 y estado `ACTIVE`, `BLOCKED` u `OUT_OF_SERVICE`.
- Horarios: `/api/v1/staff/branches/:branchId/schedules`, un servicio por día semanal, con cruce de medianoche y validación de solapamientos.
- Excepciones: `/api/v1/staff/branches/:branchId/schedule-exceptions`, cierre o cambio de horario para una fecha local.
- Bloqueos: `/api/v1/staff/branches/:branchId/tables/:tableId/blocks`, intervalos con zona horaria, almacenados en UTC; sin superposiciones en la misma mesa.
- Consulta pública: `GET /api/v1/branches/:branchId/hours?date=2026-11-02`, devuelve el servicio iniciado en esa fecha, su origen y su ventana UTC. Para mesas libres usar la consulta de disponibilidad.

Los intervalos se consideran `[inicio, fin)`: dos servicios o bloqueos pueden tocarse sin superponerse. Una excepción sustituye el servicio que inicia en su fecha; no recorta el servicio nocturno iniciado el día anterior. Por ahora no hay múltiples turnos por día ni eliminación permanente de mesas por HTTP.

## Disponibilidad y reservas

Ver [la guía de reservas](docs/RESERVAS.md) para ejemplos y políticas completas.

- Público: `GET /api/v1/branches/:branchId/availability?date=2026-11-02&partySize=4`.
- CUSTOMER: `POST /api/v1/reservations`, con `branchId`, `serviceDate`, `startAt` y `partySize`.
- Usuario autenticado: `GET /api/v1/reservations`, `GET /api/v1/reservations/:id` y `POST /api/v1/reservations/:id/cancel`, únicamente para sus reservas.
- Personal autorizado: agenda `GET /api/v1/staff/branches/:branchId/reservations?date=2026-11-02`, detalle por ID y cancelación del restaurante con motivo obligatorio.

Duración de 120 minutos; una mesa por reserva, asignada por menor capacidad suficiente, sin combinar mesas. Se exige inicio futuro alineado con los turnos del servicio y fin dentro de su horario. El cliente cancela con al menos 6 horas de anticipación; el personal puede cancelar antes del inicio. No se envían notificaciones ni se implementa todavía reprogramación.

La disponibilidad es orientativa: al confirmar se vuelve a comprobar bajo transacción. Se rechazan bloqueos, reducción de capacidad, cambios de estado o de horarios que invaliden reservas confirmadas vigentes. Los cambios operativos no cancelan reservas automáticamente.

## Validación

```powershell
pnpm.cmd build
pnpm.cmd test
pnpm.cmd lint
pnpm.cmd --filter @repo/api exec prisma validate
```

Las 15 pruebas cubren configuración, sesiones, autenticación HTTP con datos simulados, fechas de servicio, solapamientos, límites de reservas y cancelación. No reemplazan una prueba de integración contra PostgreSQL. `db:migrate` sirve para crear nuevas migraciones durante desarrollo; `db:deploy` aplica las versionadas.

Para probar contra una base real ya migrada, compilar y ejecutar `pnpm.cmd --filter @repo/api test:integration`. Comprueba autenticación, permisos y operación; además prueba disponibilidad, reserva concurrente, asignación por capacidad, privacidad, agenda, cancelación y protección de configuración. Inicia una API temporal y elimina sus propios usuarios, sesiones, sucursales y recursos asociados, incluidas reservas y eventos. No ejecutarlo contra producción.

## Instalación local de este equipo

Esta sección describe el equipo de desarrollo ya configurado; clonar el repositorio no instala PostgreSQL ni copia las credenciales. Para un equipo nuevo, seguir primero «Inicio local». Usar PostgreSQL instalado o Docker, uno por vez: ambos ejemplos utilizan el puerto 5432.

PostgreSQL 16 está instalado como servicio de Windows `postgresql-x64-16`, en el puerto 5432. La base es `app_resto_dev`, y la API usa el rol `app_resto`, sin permisos de superusuario ni creación de roles o bases.

`apps/api/.env` contiene la conexión configurada. Las credenciales locales de administración y de aplicación se guardan en `.env.postgres.local`, excluido de Git. La configuración anterior de la API se conserva en `.env.api-before-postgres.local`, también excluida de Git. No compartir ni versionar estos archivos.

No es necesario Docker para esta instalación. Para volver a configurar la conexión con esas credenciales, ejecutar `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/configure-local-postgres.ps1`. El script conserva roles y bases existentes y comprueba la conexión antes de editar `.env`.

Para iniciar la API después de reiniciar el equipo:

```powershell
pnpm.cmd --filter @repo/api start
```

Antes de exponer la API a internet, agregar límites de intentos de autenticación, política CORS por dominio y HTTPS, y definir recuperación de contraseñas/verificación de correo. Esas funciones aún no están implementadas.

## Cómo continuar el proyecto

Seguir las etapas de [docs/PLAN.md](docs/PLAN.md) y usar [docs/PRODUCCION.md](docs/PRODUCCION.md) como lista de salida a producción. En cada cambio, actualizar este README con el comportamiento real, los comandos y las limitaciones que correspondan; actualizar también el plan cuando cambie el estado de una etapa. Registrar las validaciones realizadas antes de hacer commit y subir los cambios. No incluir archivos `.env`, credenciales ni logs en Git.

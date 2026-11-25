# App Resto

Monorepo pnpm con API NestJS, validación Zod y tipos compartidos.

## Estado

El alcance acordado es **publicar la aplicación web en un hosting, dejarla funcionando y presentarla como proyecto final de la maestría en desarrollo con IA**. La entrega incluye documentación del proceso con Lovable, Codex y GitHub. Google Play y App Store quedan fuera de esta etapa. La elección y contratación de hosting/correo se acordarán con el propietario.

Estado al 25 de noviembre de 2026: etapas 1 a 6 completadas en desarrollo local, con sesiones HttpOnly y recuperación de reservas/gestión entre pestañas. Etapa 7 en curso: límites por IP/correo, CSP, recuperación de contraseña y verificación de correo implementados localmente. CI verificada en GitHub y retención del buzón local incorporada. Falta activar y verificar la entrega SMTP real y completar la preparación de producción.

- Identidad: registro, login, perfil, renovación y cierre de sesión con persistencia PostgreSQL/Prisma.
- Organización: permisos por rol, sucursales y asignaciones de personal, con permisos consultados en cada petición.
- Operación: mesas y estados, horarios semanales, excepciones y bloqueos, incluida conversión horaria y servicios nocturnos.
- Reservas: disponibilidad, asignación automática, reservas propias, agenda del personal y cancelaciones con eventos y control de concurrencia.

El registro público crea clientes; el administrador se crea mediante un comando explícito. Swagger permite probar la API durante el desarrollo.

El diseño del frontend se adaptó desde Lovable conservando nuestras reglas y autenticación. Están conectados sucursales, disponibilidad, registro/login, confirmación, reservas propias y cancelación. Ver [FRONTEND.md](docs/FRONTEND.md).

El registro de **asistencia y ausencia** aplica puntos de forma transaccional y auditable: asistencia +1, encuesta +2 y ausencia −3, con saldo mínimo cero. **Mis reservas** muestra saldo, nivel e historial; una visita con asistencia ya finalizada permite responder su encuesta. STAFF/ADMIN operan desde **Agenda** y ADMIN gestiona usuarios, asignaciones y ajustes auditados desde **Administración**. Los eventos anteriores no se recalculan automáticamente. Ver [FIDELIZACION.md](docs/FIDELIZACION.md) y [GESTION-WEB.md](docs/GESTION-WEB.md). La configuración operativa web está implementada; sigue la preparación del despliegue, detallada en el [plan](docs/PLAN.md) y la [hoja de ruta a producción](docs/PRODUCCION.md).

La API responde **429** con tiempo de espera cuando una IP supera la cuota: login 30/15 min, registro 10/hora, renovación 60/min, modificaciones 120/min y consultas 300/min. Además, **5 fallos de ingreso al mismo correo en 15 minutos provocan una pausa de 60 segundos**, compartida entre web/Swagger e IP. Los rechazos no prolongan la pausa y un ingreso correcto limpia los fallos de esa cuenta. No revoca sesiones existentes ni desactiva usuarios; intentos simultáneos al mismo correo reciben 429/1 segundo mientras se comprueba el primero. Logout y salud quedan disponibles. No hay reenvíos automáticos ni pérdida del UUID pendiente. Funciona por defecto sin servicios externos ni migraciones; contadores en memoria de un proceso, reiniciados al reiniciar la API. Configuración `RATE_LIMIT_*`, `LOGIN_ACCOUNT_FAILURES`, `LOGIN_ACCOUNT_PAUSE_SECONDS`, proxies y restricciones para varias instancias en [LIMITES-API.md](docs/LIMITES-API.md). Un ataque persistente todavía puede provocar pausas repetidas; no se considera protección completa ni certificación para producción.

**CSP implementada:** el build web solo permite scripts y conexiones del mismo origen, mantiene Google Fonts y las imágenes/previsualizaciones y bloquea scripts inline/eval. Incluye CSP en el HTML; `preview` agrega encabezados HTTP y la compilación genera `dist/security-headers.json` para configurar el futuro hosting. Ese JSON no instala encabezados automáticamente. Desarrollo tiene excepciones separadas para HMR y Swagger una política propia. Ver [CSP.md](docs/CSP.md), comandos y limitaciones de despliegue. No requiere servicios ni migraciones nuevos.

Validación del 12 de noviembre: build, tipos, 72 pruebas (39 API + 33 web), integración PostgreSQL y doce recorridos de `pnpm.cmd --filter @repo/web test:security` aprobados. Incluye fallos por correo, pausa sin prórroga, concurrencia, recuperación por éxito/vencimiento, mensaje de espera en móvil/escritorio, recuperación con el mismo UUID tras 429, CSP, Swagger y flujos del build. Las primeras corridas de CSP tuvieron demoras y una desconexión de PostgreSQL; la última suite ampliada aprobó completa, incluyendo recuperación y verificación de correo. No se repitieron los veinte recorridos generales anteriores ni se hicieron pruebas de carga. Detalles en [CSP.md](docs/CSP.md) y [LIMITES-API.md](docs/LIMITES-API.md). Recuperación de contraseña y verificación de correo ya implementadas con buzón local; envío real pendiente; la cola persistente se implementó el 25 de noviembre.

## Integración continua

Está activo `.github/workflows/ci.yml` para push/PR a `main` e inicio manual. GitHub instala con el lockfile, genera Prisma, aplica las doce migraciones a PostgreSQL 16 temporal con usuario sin privilegios de administrador, compila y ejecuta pruebas de API/web, integración y navegador. Usa Node 22.19.0 (`.node-version`) y pnpm 9.15.4. No despliega, no usa credenciales reales ni envía correo a internet.

La guarda de pruebas acepta en CI únicamente una base local `app_resto_ci` o su sufijo temporal; rechaza la base de desarrollo y no carga su `.env`. En desarrollo conserva la restricción a `app_resto_dev`. Comandos nuevos: `pnpm.cmd test:guards` y `pnpm.cmd ci:preflight` (este último requiere configurar una base CI realmente descartable). Procedimiento de **Actions**, aislamiento y resultados en [CI.md](docs/CI.md). **CI remota aprobada el 13 de noviembre:** [ver ejecución 43459544441](https://github.com/aletorresprado/restaurant/actions/runs/43459544441), commit `ab7b4bf`, en Ubuntu 24.04. Aprobaron todos los pasos: cuatro guardas, build/tipos, 81 pruebas API/web, integración PostgreSQL, prueba del operador y 20+12 recorridos de navegador.

Primera ejecución remota iniciada el 13 de noviembre: detectó un BOM UTF-8 en `package.json` al instalar pnpm. Se normalizó el archivo a UTF-8 sin BOM y se volvió a ejecutar CI. La repetición aprobó completa y se agregó una prueba de regresión para JSON sin BOM. Evidencia en [CI.md](docs/CI.md).

Validación local de CI: actionlint, tres guardas de destino, permisos del usuario, diez migraciones desde cero y repetición sin pendientes, build/tipos, 81 pruebas API/web, integración y prueba del operador aprobados. Últimas suites de navegador: **20 recorridos generales + 12 de seguridad aprobados** sobre bases descartables. Hubo fallos iniciales de tiempo en bloqueos; se corrigió el helper para esperar la sesión visible y la redirección, y la corrida general final aprobó completa. No se modificaron los tiempos de producción ni se ocultaron errores con reintentos. Las bases temporales fueron retiradas; La ejecución Ubuntu remota también aprobó y confirma el aislamiento con PostgreSQL temporal.

## Mantenimiento y salud de PostgreSQL

Actualización del 25 de noviembre de 2026: el buzón local retira automáticamente mensajes generados hace más de siete días. `MAIL_LOCAL_RETENTION_DAYS` permite elegir de 1 a 30 días; se ejecuta al iniciar y con el intervalo de mantenimiento. Solo modo de archivos fuera de producción, máximo 500 borrados/10.000 entradas por pasada, sin recorrer subcarpetas. También exige antigüedad de modificación para preservar archivos recién tocados. `MAINTENANCE_ENABLED=false` desactiva ambas limpiezas. No requiere cuenta externa, dependencias ni migraciones. Detalles y límites en [MANTENIMIENTO.md](docs/MANTENIMIENTO.md). La entrega SMTP real sigue pendiente; la cola se describe en COLA-CORREO.md.

Validación de este avance: build y tipos del monorepo, 54 pruebas de API + 33 de frontend y cuatro guardas aprobados. La nueva limpieza se probó únicamente con carpetas temporales; no se ejecutó contra el buzón existente. No se repitieron integración PostgreSQL ni navegador, ya que no cambia base, API pública ni interfaz. Retención y cola verificadas posteriormente en GitHub: [CI 45640945652](https://github.com/aletorresprado/restaurant/actions/runs/45640945652).

Desde el 13 de noviembre, la API limpia sesiones y enlaces vencidos al iniciar y cada 15 minutos, en lotes acotados, conservando los vigentes. Usa UTC explícito y no toca cuentas, reservas ni puntos. La limpieza del buzón es independiente y se describe arriba. Variables opcionales `MAINTENANCE_ENABLED`, `MAINTENANCE_INTERVAL_SECONDS` y `MAINTENANCE_BATCH_SIZE` en `.env.example`.

Para probar: iniciar `pnpm.cmd dev` y abrir [salud del proceso](http://127.0.0.1:3000/api/v1/health) y [salud de PostgreSQL](http://127.0.0.1:3000/api/v1/health/ready). El primero conserva su contrato; el segundo devuelve HTTP 200 con `checks.database: up`, o 503 si la base falla o supera el plazo de 2 segundos. Caché interna de 1 segundo y una consulta compartida evitan acumular comprobaciones; el timeout HTTP no cancela físicamente una consulta pendiente. No expone detalles de conexión.

Validación de esta entrega: build, tipos, **81 pruebas (48 API + 33 web)** e integración PostgreSQL ampliada. La limpieza se verifica en tablas temporales con la estructura real, sin eliminar datos de la aplicación; incluye vigentes a un minuto de vencer, presupuesto por ejecución e idempotencia en Pacific/Auckland. La primera prueba detectó un desfase horario que se corrigió con comparación UTC explícita. No se repitieron los doce recorridos de navegador del incremento anterior ni se hicieron pruebas de carga. Procedimiento de Swagger, logs, configuración y pendientes en [MANTENIMIENTO.md](docs/MANTENIMIENTO.md).

## Correo y recuperación de cuenta

Actualización del 25 de noviembre: la cola persistente ya está implementada. PostgreSQL guarda los mensajes cifrados en la misma transacción que registro, enlace o restablecimiento; la API retoma pendientes al reiniciar y reintenta hasta cinco veces. Descarta enlaces inválidos y borra contenido al finalizar. Los metadatos terminados duran siete días. La entrega puede repetirse si se pierde una confirmación; el enlace sigue siendo de uso único. No requiere un proveedor para probar localmente; SMTP real sigue pendiente.

Se agregaron y aplicaron localmente las migraciones once y doce: `20261125000100_mail_queue` y `20261125000200_mail_queue_scope`. Para actualizar otra instalación: `pnpm.cmd --filter @repo/api exec prisma generate`, `pnpm.cmd --filter @repo/api exec prisma migrate deploy`, compilar y reiniciar. Producción exige `MAIL_QUEUE_KEY` independiente y estable, fuera de Git. No recupera mensajes perdidos antes de instalar la cola. Guía y límites en [COLA-CORREO.md](docs/COLA-CORREO.md).

Validación de la cola: build/tipos y Prisma aprobados, **92 pruebas (59 API + 33 web)**, cuatro guardas e integración PostgreSQL completa. Últimos recorridos de seguridad: **12/12 aprobados**. Una corrida previa tuvo dos fallos en ingreso y otra integración concurrente agotó su espera; ambas suites aprobaron al repetirse separadas sin alterar timeouts. Antecedentes en [PLAN.md](docs/PLAN.md). La ejecución remota posterior [CI 45640945652](https://github.com/aletorresprado/restaurant/actions/runs/45640945652), commit `9636eaa`, también aprobó los veinte recorridos generales y los doce de seguridad, con doce migraciones desde cero. Commit/push completados y CI aprobada; no se probó carga ni SMTP real.

Desde **Ingresar** están disponibles **Olvidé mi contraseña** y **Verificar mi correo**; las cuentas sin verificar muestran un aviso y pueden seguir reservando. La décima migración `20261112000100_account_actions` está aplicada localmente. En otra instalación: actualizar dependencias, generar Prisma, aplicar migraciones y compilar antes de reiniciar.

Por defecto, los mensajes se guardan como archivos privados en `apps/api/.local/mail`: abrir el JSON del destinatario y copiar el enlace completo al navegador. No se envían correos reales. Reset vence en 15 minutos y verificación en 24 horas; ambos requieren confirmación y solo sirven una vez. Restablecer invalida cookies, refresh y JWT anteriores sin modificar reservas, puntos ni roles. Ver [CORREO-CUENTAS.md](docs/CORREO-CUENTAS.md) para el recorrido paso a paso, Swagger, variables SMTP y limitaciones de entrega.

Se agregó Nodemailer 10.5.0. `MAIL_MODE=file` es solo local; producción exige `MAIL_MODE=smtp`, remitente y credenciales privados y `PUBLIC_WEB_URL` HTTPS incluido en `WEB_ORIGINS`. Antes de enviar a casillas reales falta acordar proveedor/costo, verificar el remitente y comprobar entrega; la cola persistente está implementada; ver COLA-CORREO.md. No se contrató ningún servicio ni se enviaron mensajes reales. Los archivos del buzón están ignorados por Git y bloqueados en Vite; no compartirlos.

**Aceptación manual del propietario, 12 de noviembre:** completó satisfactoriamente la recuperación de contraseña y la verificación de correo siguiendo el recorrido del buzón local. Confirmó que pudo realizar ambas pruebas desde la web. Esta aceptación valida el uso local; no acredita entrega a Gmail/SMTP ni publicación en producción. El procedimiento y las comprobaciones automáticas están en [CORREO-CUENTAS.md](docs/CORREO-CUENTAS.md).

## Un proyecto, varias herramientas

App Resto se desarrolla combinando aplicaciones y asistentes con responsabilidades complementarias, bajo la dirección de su propietario. El diseño visual y la implementación funcional se trabajaron en entornos distintos y luego se integraron en este proyecto.

| Herramienta | Aporte al proyecto |
| --- | --- |
| Lovable | Diseño y prototipo navegable del frontend: identidad visual, pantallas del cliente, estilos y componentes reutilizables. |
| GitHub | Versionado e intercambio del código entre el prototipo visual y el desarrollo de App Resto. |
| Codex | Desarrollo de la API y adaptación del frontend, con apoyo de sus skills de trabajo, las instrucciones del repositorio y pruebas automatizadas. |
| Playwright y herramientas de prueba | Verificación del recorrido integrado en escritorio y móvil contra PostgreSQL real. |

El trabajo siguió este recorrido:

1. Definimos las funciones y reglas del restaurante y desarrollamos la API propia.
2. Llevamos ese contexto a Lovable mediante un prompt del proyecto y trabajamos allí el diseño de la interfaz.
3. Publicamos el prototipo en [pixel-perfect-replica](https://github.com/aletorresprado/pixel-perfect-replica), que sirvió como punto de intercambio entre las herramientas.
4. Desde Codex revisamos su código, componentes e instrucciones de trabajo y adaptamos el diseño a `apps/web`, conectándolo con nuestra API y sus validaciones compartidas.
5. Reemplazamos los datos simulados por operaciones reales y verificamos registro, acceso, disponibilidad, confirmación y cancelación en navegador.

El resultado conserva el lenguaje visual creado en Lovable y las reglas de negocio de App Resto. Las diferencias del prototipo se resolvieron en la interfaz: fechas, turnos, permisos y mensajes se ajustaron al comportamiento existente del backend.

Esta colaboración se realiza mediante código versionado y adaptación explícita; los repositorios no se sincronizan automáticamente. La referencia de origen está registrada en [SOURCE.md](apps/web/SOURCE.md) y los detalles de integración en [FRONTEND.md](docs/FRONTEND.md).

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

Con la API configurada y el build inicial completo, `pnpm.cmd dev` inicia API y web. Si la API ya está encendida, usar `pnpm.cmd --filter @repo/web dev` para iniciar solo la interfaz en http://127.0.0.1:5173. La web consulta `/api/v1` mediante un proxy local. No se cargan datos ficticios al iniciar: una base sin sucursales activas muestra el estado vacío correspondiente.

Para probar el recorrido en una base local vacía, ejecutar explícitamente:

```powershell
pnpm.cmd --filter @repo/api db:seed:dev
```

Crea una **Sucursal de prueba — Desarrollo**, tres mesas para 2, 4 y 6 personas y un servicio diario de 12:00 a 02:00 del día siguiente. Solo admite `NODE_ENV=development` y la base `app_resto_dev` en localhost. Se puede repetir: no duplica la sucursal ni sobrescribe sus cambios posteriores. No crea usuarios; registrarse desde la interfaz para reservar. Los datos son ficticios, quedan identificados como desarrollo y no deben usarse como configuración real del restaurante.

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

Los endpoints Bearer de esta tabla (Swagger/clientes API) devuelven `user`, `accessToken` y `refreshToken`. La web usa `/auth/web/login`, `/auth/web/register` y `/auth/web/logout`, con cookies HttpOnly, y recibe solo el usuario. La contraseña requiere al menos 8 caracteres, una mayúscula y un número; máximo 72 bytes por el límite de bcrypt. Correos normalizados a minúsculas. Nunca se devuelven hashes de contraseñas.

Al renovar, reemplazar ambos tokens en el cliente: el refresh anterior deja de funcionar. Logout revoca el refresh presentado; el access token sigue vigente hasta su expiración (15 minutos por defecto). Restablecer la contraseña incrementa la versión de credenciales y revoca también los access tokens anteriores. Logout de todos los dispositivos como acción independiente sigue pendiente. Las sesiones vencidas se rechazan y sus registros se limpian periódicamente junto con los enlaces vencidos; ver [MANTENIMIENTO.md](docs/MANTENIMIENTO.md).

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
- CUSTOMER: `POST /api/v1/reservations`, con `branchId`, `serviceDate`, `startAt`, `partySize` y `operationId` (UUID por intento, reutilizado en sus reintentos).
- Usuario autenticado: `GET /api/v1/reservations`, `GET /api/v1/reservations/:id` y `POST /api/v1/reservations/:id/cancel`, únicamente para sus reservas.
- Personal autorizado: agenda `GET /api/v1/staff/branches/:branchId/reservations?date=2026-11-02`, detalle por ID y cancelación del restaurante con motivo obligatorio.

Duración de 120 minutos; una mesa por reserva, asignada por menor capacidad suficiente, sin combinar mesas. Se exige inicio futuro alineado con los turnos del servicio y fin dentro de su horario. El cliente cancela con al menos 6 horas de anticipación; el personal puede cancelar antes del inicio. No se envían notificaciones ni se implementa todavía reprogramación.

La disponibilidad es orientativa: al confirmar se vuelve a comprobar bajo transacción. Se rechazan bloqueos, reducción de capacidad, cambios de estado o de horarios que invaliden reservas confirmadas vigentes. Los cambios operativos no cancelan reservas automáticamente.

**Recuperación ante cortes de conexión (11 de noviembre):** la web guarda la confirmación antes del primer envío y ofrece **Verificar y reintentar** o **Retomar confirmación** tras una recarga o un nuevo ingreso con la misma cuenta. El servidor reconoce `(usuario, operationId)` y devuelve la reserva existente, sin otra mesa ni evento, incluso si ya está cancelada. Cambiar los datos de esa operación devuelve 409. La confirmación pendiente se comparte entre pestañas mediante un registro por usuario en `localStorage` y Web Locks; la sesión utiliza una cookie HttpOnly. Si no se puede guardar/coordinar el intento, no se envía. No se reintenta automáticamente. El campo es opcional solo por compatibilidad con clientes antiguos: un POST sin UUID no tiene esta protección. Ver [RECUPERACION-RESERVAS.md](docs/RECUPERACION-RESERVAS.md) para pruebas, privacidad, límites y Swagger.

Esta entrega agrega la **séptima migración**, `20261111000100_reservation_operations`, aplicada localmente. En otra instalación ejecutar `pnpm.cmd --filter @repo/api db:generate`, `pnpm.cmd --filter @repo/api db:deploy` y `pnpm.cmd build` antes de reiniciar. Conserva las reservas existentes, sin cambios en duración, asignación, horarios o puntos; no requiere dependencias ni servicios nuevos.

## Asistencia y ausencias

El personal asignado o un administrador puede ejecutar `POST /api/v1/staff/branches/:branchId/reservations/:id/attendance` con `{ "outcome": "ATTENDED" }` o `{ "outcome": "NO_SHOW" }` y un motivo opcional. Asistencia desde el inicio; ausencia después de los 30 minutos de tolerancia configurados. Repetir el mismo resultado no duplica eventos ni puntos y no se permite sobrescribir un resultado ya registrado. La asistencia mantiene ocupada la mesa hasta el fin previsto; la ausencia la libera. Ver [ASISTENCIA.md](docs/ASISTENCIA.md) y [FIDELIZACION.md](docs/FIDELIZACION.md).

La fidelización agrega la quinta migración, `20261103000100_loyalty`. Para actualizar otra instalación de desarrollo, ejecutar `pnpm.cmd --filter @repo/api db:generate`, `pnpm.cmd --filter @repo/api db:deploy` y `pnpm.cmd build`, antes de reiniciar los servicios. No requiere contratar servicios adicionales.

### Agenda y administración web

Para continuar el desarrollo después de esta entrega, consultar el **punto de reanudación del 12 de noviembre** en [docs/PLAN.md](docs/PLAN.md). La configuración operativa principal ya tiene gestión web y las reservas permiten recuperar reintentos; las etapas funcionales 1–6 están verificadas en desarrollo local y sigue la preparación productiva de la etapa 7.

Las cuentas STAFF ingresan a **Agenda** (`/personal`): sucursal asignada, fecha de servicio, reservas, asistencia, ausencia, cancelación e historial. Las cuentas ADMIN también acceden a **Administración** (`/administracion`): **Usuarios y puntos** para roles, asignaciones y ajustes auditados; **Sucursales** para crear, editar, activar y desactivar, con validación de datos y confirmación de desactivación. Los cambios actualizan el catálogo y las sucursales disponibles para agenda/asignaciones. La API rechaza desactivar sucursales con reservas vigentes. Una sucursal nueva necesita mesas y horarios para ofrecer turnos; esa configuración sigue disponible desde Swagger.

Si solo hay cuentas de cliente, crear un administrador separado con `powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\create-admin.ps1` desde la raíz. Pide un correo nuevo y una contraseña oculta; no cambia cuentas existentes ni guarda credenciales en archivos. Luego salir de la app e ingresar con esa cuenta. Ver [GESTION-WEB.md](docs/GESTION-WEB.md) para uso, pruebas y límites.

Si olvidaste la contraseña de una cuenta de desarrollo existente, ejecutar desde la raíz:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\reset-local-password.ps1 -Email "tu-correo@example.com"
```

Pide una nueva contraseña oculta (mínimo 8 caracteres, una mayúscula y un número; máximo 72 bytes). Solo admite `NODE_ENV=development` y PostgreSQL local `app_resto_dev`. Conserva cuenta, rol, reservas y puntos; actualiza el hash y elimina sus sesiones de renovación en una transacción. También invalida los access tokens anteriores mediante la versión de credenciales y elimina enlaces de cuenta pendientes; volver a ingresar en la web o generar otro token en Swagger. No reactiva cuentas desactivadas, no envía correos ni guarda contraseñas en archivos. Es una herramienta del operador local, no recuperación pública de contraseña. Verificación con cuentas temporales: `pnpm.cmd --filter @repo/api exec node --test scripts/reset-local-password.test.cjs`.

**Mesas** (`/mesas`) permite a ADMIN y STAFF autorizado elegir sucursal, listar mesas con paginación, crear con capacidad 1–50 y editar capacidad/estado. ADMIN también llega desde **Administración → Sucursales → Gestionar mesas** y puede configurar sucursales inactivas. El número queda fijo y es único dentro de cada sucursal. Los cambios a Bloqueada o Fuera de servicio requieren confirmación, y la API impide afectar reservas vigentes. No hay borrado permanente. Ver [MESAS-WEB.md](docs/MESAS-WEB.md) para el recorrido, pruebas y límites. Esta entrega no requiere nuevas dependencias ni migraciones.

**Horarios** (`/horarios`) permite gestionar el servicio semanal y las excepciones por fecha: alta, edición, activación/desactivación y eliminación con confirmación cuando corresponde. Incluye consulta del servicio efectivo por fecha, horarios nocturnos y errores de solapamiento o reservas vigentes. ADMIN también llega desde cada sucursal con **Gestionar horarios**; STAFF queda limitado a sus sucursales activas asignadas. Las horas se interpretan en la zona del restaurante, no la del navegador. Ver [HORARIOS-WEB.md](docs/HORARIOS-WEB.md). Usa la API existente, sin migraciones ni dependencias nuevas.

Desde **Mesas → Bloqueos temporales** se consultan, crean y retiran intervalos con inicio, fin y motivo, en la zona del restaurante. Se revisa y confirma antes de guardar; la API rechaza cruces con reservas u otros bloqueos. Retirarlos no reactiva una mesa Bloqueada o Fuera de servicio. Ver [BLOQUEOS-WEB.md](docs/BLOQUEOS-WEB.md). La web declara ahora las bibliotecas de fechas `date-fns`/`date-fns-tz` ya utilizadas por la API: al actualizar otro equipo ejecutar `pnpm.cmd install --frozen-lockfile` y compilar. No hay migraciones nuevas.

Los niveles de fidelización se muestran con **estrella de color y nombre**: White, Bronze, Silver, Gold y Platinum, tanto en Mis puntos como en Administración. White usa relleno blanco con contorno para distinguirse sobre el fondo claro. Mis puntos incluye la lista desplegable **Niveles de fidelización** con los umbrales de la configuración compartida; no cambian saldo, niveles ni recompensas.

Cada sucursal puede tener una **imagen propia para el inicio**. En Administración → Sucursales, elegir un archivo JPG, PNG o WebP de hasta 2 MB en su tarjeta y pulsar **Guardar imagen**. Hay vista previa, reemplazo y borrado con confirmación; sin foto se usa la imagen general. Las imágenes se guardan en PostgreSQL, no en Git ni en el navegador, y no requieren otra cuenta o servicio. La visualización usa formato 4:3 con recorte centrado; no se modifica ni comprime el archivo original.

Esta función agrega la sexta migración, `20261104000100_branch_images`, ya aplicada en el equipo de desarrollo. En otras instalaciones, detener la API si bloquea Prisma en Windows y ejecutar `pnpm.cmd --filter @repo/api db:generate`, `pnpm.cmd --filter @repo/api db:deploy` y `pnpm.cmd build` antes de reiniciar `pnpm.cmd dev`. Las copias de seguridad de PostgreSQL deben incluir las imágenes. Ver [IMAGENES-SUCURSALES.md](docs/IMAGENES-SUCURSALES.md).

**Recuperación de gestión:** las altas de sucursales, mesas, horarios, excepciones y bloqueos usan `Idempotency-Key`. Si se corta la conexión, abrir **Operaciones pendientes** debajo del menú, revisar destino/datos y pulsar **Verificar y reintentar**. Se conserva el UUID al recargar o volver a ingresar y se comparte por cuenta entre pestañas; recuperar no duplica el alta ni recrea un registro eliminado. Los borradores/ajustes de puntos se comparten por administrador y cliente, con UUID y autor fijos tras intentar enviarlos. Solo persisten pendientes; se eliminan al resolver. Sin almacenamiento o Web Locks no se envía. PATCH/PUT/DELETE mantienen sus reglas, sin control de versiones nuevo. Ver [RECUPERACION-GESTION.md](docs/RECUPERACION-GESTION.md), incluidos datos conservados en equipos compartidos y compatibilidad de clientes antiguos sin clave.

La **novena migración**, `20261111000300_management_operations`, está aplicada localmente. Agrega el registro transaccional de altas por usuario y operación; no recalcula puntos ni modifica registros anteriores. En otra instalación, detener la API si bloquea Prisma en Windows, generar cliente, aplicar migraciones y compilar antes de reiniciar. No requiere dependencias ni cuentas nuevas. Esta entrega completa la etapa 6 en desarrollo local; la etapa 7 incorpora límites por IP/correo y CSP local; mantiene pendientes entrega SMTP real e infraestructura, según [PLAN.md](docs/PLAN.md).

Prueba manual confirmada por el propietario: revisar un ajuste de +2 puntos muestra el borrador en dos pestañas; **Volver a editar** lo retira de ambas y habilita nuevamente los campos. Revisar/cancelar no aplica puntos; solo **Confirmar ajuste** envía el movimiento. Validación automatizada de esta entrega: 49 pruebas unitarias, integración PostgreSQL y veinte recorridos de navegador aprobados.

## Validación

```powershell
pnpm.cmd build
pnpm.cmd test
pnpm.cmd lint
pnpm.cmd --filter @repo/api exec prisma validate
```

Las pruebas de API cubren configuración, sesiones, autenticación HTTP con datos simulados, fechas de servicio, solapamientos, límites de reservas, cancelación, tiempos de asistencia/ausencia y límites de solicitudes con HTTP real. No reemplazan una prueba de integración contra PostgreSQL. `db:migrate` sirve para crear nuevas migraciones durante desarrollo; `db:deploy` aplica las versionadas.

El frontend agrega pruebas de sesiones por cookie, errores de conexión, logout, privacidad de confirmaciones y fechas; `pnpm.cmd test` incluye API y web. Para el recorrido real en navegador, después de compilar e instalar Chromium con `pnpm.cmd --filter @repo/web exec playwright install chromium`, ejecutar `pnpm.cmd --filter @repo/web test:e2e`. Usa PostgreSQL de desarrollo y recursos temporales propios. Detalles y límites de sesión en [FRONTEND.md](docs/FRONTEND.md).

**Sesiones y privacidad (11 de noviembre):** la web ya no recibe ni guarda tokens accesibles a JavaScript. Usa una cookie HttpOnly por pestaña, con vencimiento absoluto de ocho horas por defecto y revocación inmediata al salir. sessionStorage conserva únicamente un UUID público que no autentica sin su cookie. Web Locks impide restaurar una copia de la sesión original. Sin esa protección el ingreso funciona en memoria y requiere login al recargar; confirmar reservas requiere Web Locks y almacenamiento disponible. Las respuestas de una cuenta anterior no se muestran ni se reenvían bajo la nueva. Resolver una confirmación elimina su registro local; los intentos pendientes se conservan por cuenta para recuperar cortes. Swagger conserva Bearer/JWT. Ver [SESIONES-WEB.md](docs/SESIONES-WEB.md) para CSRF, privacidad y límites de XSS.

La **octava migración**, `20261111000200_browser_sessions`, está aplicada localmente. En otra instalación generar Prisma, aplicar migraciones y compilar antes de arrancar. Tras actualizar, recargar e ingresar de nuevo: se elimina el almacenamiento anterior con tokens, sin cambiar contraseñas ni datos del negocio. Web y `/api/v1` deben compartir origen (Vite ya hace proxy). `WEB_ORIGINS` admite localhost:5173 y 127.0.0.1:5173 en desarrollo; producción exige una lista explícita de orígenes HTTPS. `WEB_SESSION_HOURS` permite 1–24 horas. CORS se restringe a esos orígenes, sin credenciales entre orígenes, y las escrituras web validan Origin. En producción la cookie usa Secure y prefijo `__Host-`; debe existir HTTPS. No hay dependencias ni servicios nuevos.

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

Antes de exponer la API a internet, aplicar/verificar los encabezados CSP en el hosting, comprobar HTTPS/CORS y proxies y configurar/verificar el envío SMTP real, la cola de correo y su supervisión. CSP local, CORS explícito y límites por IP/correo ya están implementados; los contadores actuales requieren una sola instancia. Ver [CSP.md](docs/CSP.md), [LIMITES-API.md](docs/LIMITES-API.md) y la hoja de ruta.

## Cómo continuar el proyecto

Seguir las etapas de [docs/PLAN.md](docs/PLAN.md) y usar [docs/PRODUCCION.md](docs/PRODUCCION.md) como lista de salida a producción. En cada cambio, actualizar este README con el comportamiento real, los comandos y las limitaciones que correspondan; actualizar también el plan cuando cambie el estado de una etapa. Registrar las validaciones realizadas antes de hacer commit y subir los cambios. No incluir archivos `.env`, credenciales ni logs en Git.

# Hoja de ruta a producción

Actualizado: 12 de noviembre de 2026.

## Punto de partida

Las etapas 1–6 del [plan](PLAN.md) están implementadas en desarrollo local. Hay diez migraciones versionadas, 39 pruebas de API e integración PostgreSQL con concurrencia, aislamiento, asistencia, puntos, encuestas, ajustes, imágenes e idempotencia de reservas. El frontend agrega 33 pruebas unitarias y veinte recorridos de navegador contra la base real verificados en la entrega anterior: cliente, gestión, sucursales, mesas, horarios, bloqueos, sesiones y recuperación de reservas en escritorio/móvil. Incluyen respuestas perdidas, recarga sin reenvío automático, dos pestañas recuperando una misma reserva y almacenamiento bloqueado. La recuperación de altas y ajustes entre pestañas está implementada; ver [RECUPERACION-GESTION.md](RECUPERACION-GESTION.md). La etapa 7 está en curso con límites por IP/correo y CSP local para una instancia de API. Las sesiones web ya usan cookies HttpOnly; ver SESIONES-WEB.md.

La base local, sus contraseñas y los logs no forman parte del repositorio. El servicio de Windows y los procesos iniciados en el equipo de desarrollo no constituyen un despliegue productivo. Hay web de clientes, agenda del personal y administración de usuarios, asignaciones, puntos y configuración operativa. Siguen pendientes infraestructura e integración continua.

## 1. Asistencia y fidelización — etapa 5 completada; mejoras operativas pendientes

- [ ] Definir correcciones auditables para un resultado de asistencia erróneo; hoy el primer resultado es definitivo.
- [x] Asistencia y NO_SHOW para personal autorizado, respetando la tolerancia configurada de 30 minutos para ausencia.
- [ ] Completar las transiciones de reservas para que no queden indefinidamente CONFIRMED después del servicio.
- [x] Crear el historial de transacciones de puntos, con referencia a reserva y autor, sin duplicados ante reintentos.
- [x] Aplicar las constantes compartidas: asistencia +1, encuesta +2, ausencia -3 y saldo mínimo 0.
- [x] Exponer saldo, nivel e historial propios, y ajustes de administrador con motivo obligatorio.
- [x] Incluir encuesta única de calificación 1–5 después de una asistencia finalizada.
- [x] Verificar concurrencia, permisos, ajustes y consistencia del saldo con PostgreSQL real.

Cierre: el personal completa el ciclo de una reserva y los puntos resultantes son trazables y se aplican una sola vez. El cliente puede consultar su saldo e historial.

La asistencia sigue siendo manual y su resultado definitivo. Los puntos se aplican a nuevos registros; el historial anterior no se recalcula. Reconocimientos anteriores requieren ajustes administrativos explícitos. Ver [ASISTENCIA.md](ASISTENCIA.md) y [FIDELIZACION.md](FIDELIZACION.md). Antes de operar, definir el procedimiento para corregir errores de asistencia y revisar reservas que permanezcan CONFIRMED después del servicio.

## 2. Interfaz — etapa 6 completada en desarrollo; validaciones de publicación pendientes

- [x] Web adaptable elegida: React/Vite, Tailwind y TanStack Router, adaptada del diseño de Lovable.
- [x] Registro, login y sesión para integración local; sesiones HttpOnly y coordinación entre pestañas implementadas; recuperación pública de cuenta pendiente en etapa 7.
- [x] Sucursal, fecha de servicio, tamaño de grupo, turnos libres y confirmación conectados a la API.
- [x] Reservas propias, cancelaciones y consulta de fidelización/encuestas para clientes.
- [x] Asistencia para el personal y ajustes de puntos para administración desde la interfaz.
- [x] Usuarios, cambios CUSTOMER/STAFF y asignaciones a sucursales existentes desde administración.
- [x] Formularios web de sucursales para ADMIN, con validación, confirmación de desactivación y conflictos por reservas vigentes.
- [x] Formularios web de mesas para STAFF asignado y ADMIN, con conflictos por reservas y estados persistentes.
- [x] Horarios semanales, excepciones por fecha y consulta del servicio efectivo desde la web, con conflictos y confirmaciones.
- [x] Bloqueos temporales por mesa desde la web, con zona del restaurante, revisión/confirmación, retirada y conflictos.
- [x] Resolver resultados inciertos al reservar: UUID por operación en la API, índice único por cuenta y recuperación manual persistida entre recargas/pestañas. Sin UUID (clientes antiguos) o con otra operación no hay deduplicación; ver [RECUPERACION-RESERVAS.md](RECUPERACION-RESERVAS.md).
- [x] Mostrar fechas en la zona del restaurante y explicar los servicios que cruzan medianoche.
- [ ] Verificar navegación con teclado, pantallas pequeñas, carga, errores, sesión vencida y turnos agotados durante la confirmación.
- [x] Recorridos completos de cliente, personal y administrador contra PostgreSQL local, con privacidad, roles, recuperación y escritorio/móvil. Repetir en el entorno de preproducción.

Cierre: una persona puede completar los recorridos del producto sin depender de Swagger, incluidos errores y recuperación de sesión.

El recorrido del cliente y la gestión del restaurante se conectan a la API real. La web usa cookies HttpOnly por pestaña, mantiene solamente un UUID público en sessionStorage y elimina confirmaciones locales resueltas. Validación de Origin/CSRF y CORS explícito ya implementadas; ver [SESIONES-WEB.md](SESIONES-WEB.md). Los intentos pendientes y ajustes inciertos requieren conservar información para recuperarse, con límites documentados en equipos compartidos. Altas y ajustes ya cuentan con recuperación compartida entre pestañas y minimización de resultados resueltos. Hay límites de solicitudes para una instancia y CSP local; falta la configuración real del despliegue, incluido aplicar los encabezados HTTP de la SPA en el hosting.

## 3. Preparar seguridad y operación — etapa 7, en curso

- [x] Límites por IP para registro, login, renovación, consultas y modificaciones, con 429/Retry-After y recuperación manual sin perder UUID. Implementación en memoria de un proceso; ver [LIMITES-API.md](LIMITES-API.md).
- [ ] Elegir y verificar contador compartido antes de usar varias instancias; validar cuotas bajo carga real, redes compartidas y topología de proxies. Proteger el volumen total en infraestructura.
- [x] CSP implementada para build web, desarrollo y API/Swagger, con pruebas de navegador separadas del servidor habitual. Ver [CSP.md](CSP.md).
- [ ] Aplicar los encabezados de `dist/security-headers.json` en el servidor/CDN elegido: el archivo no los configura solo y la meta CSP no ofrece `frame-ancestors`. Verificar en el dominio real.
- [x] Complementar cuotas IP con fallos por correo: 5/15 minutos, pausa temporal de 60 segundos sin prórroga por rechazos, reinicio por éxito, sin desactivar cuenta y con una sola comprobación concurrente por correo. Memoria de un proceso; ver [LIMITES-API.md](LIMITES-API.md).
- [ ] Completar recuperación de cuenta y monitoreo de ataques persistentes, que todavía pueden ocasionar pausas repetidas. Evaluar MFA para cuentas sensibles antes de la publicación.
- [x] CORS restringido a WEB_ORIGINS; producción exige orígenes HTTPS explícitos. La web/API usan el mismo origen, sin credenciales CORS. Verificar los valores del entorno de despliegue antes de publicar.
- [x] Recuperación/verificación por enlaces de un solo uso, con vencimiento, hash y pantallas web. Buzón local y adaptador SMTP; ver [CORREO-CUENTAS.md](CORREO-CUENTAS.md).
- [ ] Acordar proveedor/costo, validar remitente/dominio y probar entrega real. Agregar cola persistente, reintentos, retención de mensajes y alertas. El modo de archivos no completa el envío productivo.
- [x] Revocación inmediata de la sesión web por cookie al salir de su pestaña; guarda hash, caduca en ocho horas por defecto y comprueba estado/rol en la base.
- [ ] Definir cierre global y revocación inmediata para los JWT de clientes Bearer/Swagger, que mantienen su contrato anterior. No confundirlos con las cookies web.
- [ ] Programar limpieza de sesiones vencidas y definir conservación de bloqueos antiguos, eventos y datos de clientes.
- [ ] Configurar logs operativos sin contraseñas, tokens ni datos personales innecesarios; definir acceso y retención.
- [ ] Agregar comprobación de disponibilidad de PostgreSQL para supervisión. El endpoint `health` actual informa que el proceso responde, no valida la conexión a la base.
- [ ] Proteger o deshabilitar Swagger en producción. Hoy se publica siempre en `/api/docs`.
- [ ] Revisar dependencias y resolver los hallazgos relevantes antes de publicar.
- [ ] Validar capacidad y tiempos de respuesta bajo carga representativa. Reservas y cambios operativos se serializan por sucursal; las pruebas funcionales actuales no son una prueba de carga.

Cierre: configuración de producción explícita, políticas implementadas y pruebas de abuso, permisos y fallos básicos aprobadas.

## 4. Elegir infraestructura y automatizar — etapa 7, pendiente

- [ ] Acordar presupuesto, proveedor, región, dominio y responsables. No se presupone una cuenta externa ni un plan pago autorizado.
- [ ] Crear entornos separados de desarrollo, prueba y producción, con bases y secretos independientes.
- [ ] Elegir alojamiento para API, frontend y PostgreSQL; definir proceso de arranque, reinicio y acceso administrativo.
- [ ] Configurar HTTPS y conectividad de base restringida a los servicios que la necesitan. Las cookies Secure/__Host- requieren HTTPS real en producción; no basta la variable NODE_ENV.
- [ ] Inyectar `DATABASE_URL`, `JWT_ACCESS_SECRET`, expiraciones, `NODE_ENV` y `PORT` mediante el sistema de secretos del proveedor. No usar credenciales de `compose.yaml` ni copiar archivos `.env` locales.
- [ ] Configurar CI para instalación con lockfile, generación Prisma, compilación, pruebas, tipos e integración sobre PostgreSQL aislado.
- [ ] Definir ejecución de migraciones una sola vez por despliegue y permisos necesarios; no correr `prisma migrate dev` en producción.
- [ ] Crear un administrador inicial por el procedimiento de seed, sin credenciales predeterminadas y sin repetirlo automáticamente en cada arranque.
- [ ] Configurar copias de seguridad y retención; acordar cuánta pérdida de datos y tiempo de recuperación son aceptables.
- [ ] Verificar que respaldo y restauración incluyan las imágenes BYTEA de sucursales; dimensionar su almacenamiento y transferencia y revisar optimización/CDN si el catálogo crece. Ver [IMAGENES-SUCURSALES.md](IMAGENES-SUCURSALES.md).
- [ ] Probar restauración en una base aislada y documentar comandos específicos del proveedor elegido.
- [ ] Configurar monitoreo y alertas de errores, disponibilidad y capacidad de base, y asignar responsable de atenderlas.

Cierre: un entorno de prueba se puede desplegar y restaurar siguiendo instrucciones versionadas, sin intervención improvisada ni secretos en Git.

## 5. Validar y publicar — etapa 7, pendiente

- [ ] Completar las etapas funcionales acordadas y registrar qué funciones quedan fuera del lanzamiento.
- [ ] Desplegar primero en prueba y ejecutar recorridos reales con los tres roles, horarios nocturnos, cancelaciones, concurrencia y fidelización.
- [ ] Revisar el estado de migraciones y el respaldo antes de promover una versión.
- [ ] Documentar cómo volver a la versión anterior de la aplicación y qué hacer si la migración no es compatible. Revertir código no revierte por sí mismo cambios de datos.
- [ ] Crear datos operativos iniciales: sucursales, mesas, horarios y personal; no cargar fixtures de pruebas.
- [ ] Obtener la aprobación del propietario para publicar la versión concreta y activar dominio/servicios contratados.
- [ ] Publicar, verificar identidad, permisos, reservas y acceso a la base sin crear ni borrar datos de clientes como parte del chequeo.
- [ ] Revisar logs y alertas durante el período inicial acordado y registrar el resultado del lanzamiento.

Cierre: el producto es accesible por su dominio, con respaldos restaurables, supervisión y responsables definidos. Registrar fecha y versión desplegada.

## Comprobaciones de la versión actual

Validación del 12 de noviembre de 2026: compilación del monorepo, chequeo de tipos, 72 pruebas (39 API + 33 web), integración PostgreSQL y revisión del diff. Incluye límites por grupo, expiración, memoria acotada, solicitudes concurrentes y rechazo HTTP antes de ejecutar operaciones; la web conserva sesión y UUID tras 429. La suite aislada aprobó doce recorridos en escritorio/móvil, incluyendo pausa por cinco fallos de ingreso, build con CSP, desarrollo y Swagger. Detalles en [CSP.md](CSP.md) y [LIMITES-API.md](LIMITES-API.md). Los veinte recorridos generales de la entrega anterior son un antecedente; no se repitió esa suite completa en este incremento. No hay pruebas de carga ni despliegue de prueba. Se aplicó la décima migración de enlaces de cuenta y versión de credenciales.

Desde la raíz, con una base de desarrollo configurada y migrada:

```powershell
pnpm.cmd build
pnpm.cmd test
pnpm.cmd lint
pnpm.cmd --filter @repo/api exec prisma validate
pnpm.cmd --filter @repo/api test:integration
git diff --check
```

La integración crea y elimina únicamente sus usuarios, sucursales y recursos asociados. Nunca apuntarla a producción. Cubre las etapas 1–5, incluidos puntos, encuestas y ajustes. El frontend tiene sus propias pruebas de cliente y navegador.

Para un despliegue futuro, generar Prisma y compilar durante la construcción de la versión, aplicar las migraciones versionadas con `pnpm.cmd --filter @repo/api db:deploy` y arrancar con `pnpm.cmd --filter @repo/api start`, adaptando el ejecutable de pnpm al sistema operativo. La configuración de hosting, TLS, supervisión y respaldo sigue pendiente: estos comandos solos no completan un despliegue.

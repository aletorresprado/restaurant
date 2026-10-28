# Hoja de ruta a producción

Actualizado: 28 de octubre de 2026.

## Punto de partida

Las etapas 1–4 del [plan](PLAN.md) están implementadas: autenticación, roles y sucursales, mesas/horarios/bloqueos, disponibilidad y reservas. La API usa PostgreSQL local y se prueba mediante Swagger. Hay cuatro migraciones versionadas, 15 pruebas automatizadas y una integración contra PostgreSQL que incluye concurrencia y aislamiento entre sucursales.

La base local, sus contraseñas y los logs no forman parte del repositorio. El servicio de Windows y los procesos iniciados en el equipo de desarrollo no constituyen un despliegue productivo. No hay todavía frontend, asistencia/fidelización, infraestructura de despliegue ni integración continua configurada.

## 1. Completar asistencia y fidelización — etapa 5, pendiente

- [ ] Definir cuándo se permite marcar asistencia y cómo corregir un registro erróneo.
- [ ] Implementar asistencia y NO_SHOW para personal autorizado, respetando la tolerancia configurada de 30 minutos para ausencia.
- [ ] Completar las transiciones de reservas para que no queden indefinidamente CONFIRMED después del servicio.
- [ ] Crear el historial de transacciones de puntos, con relación al evento y autor, sin aplicar dos veces una recompensa o penalización ante reintentos.
- [ ] Aplicar las constantes compartidas: asistencia +1, encuesta +2 si se incluye, ausencia -3 y saldo mínimo 0.
- [ ] Exponer saldo, nivel e historial propios, y ajustes de administrador con motivo obligatorio.
- [ ] Acordar si encuestas y recompensas entran en el primer lanzamiento o quedan explícitamente fuera de su alcance.
- [ ] Verificar concurrencia, permisos, correcciones y consistencia del saldo con PostgreSQL real.

Cierre: el personal completa el ciclo de una reserva y los puntos resultantes son trazables y se aplican una sola vez. El cliente puede consultar su saldo e historial.

## 2. Construir la interfaz — etapa 6, pendiente

- [ ] Elegir web adaptable o aplicación móvil y acordar pantallas y prioridades. No hay tecnología de frontend elegida en el repositorio.
- [ ] Diseñar acceso, recuperación de cuenta y persistencia/renovación de sesión apropiada a la plataforma.
- [ ] Implementar sucursal, fecha de servicio, tamaño de grupo, turnos libres y confirmación.
- [ ] Implementar reservas propias, cancelaciones, asistencia para el personal y fidelización.
- [ ] Implementar administración de sucursales, asignaciones, mesas, horarios y bloqueos según rol.
- [ ] Resolver resultados inciertos al reservar: hoy no existe clave de idempotencia y repetir el POST puede crear otra reserva si queda otra mesa. Definir idempotencia en la API o un mecanismo de reconciliación antes de habilitar reintentos en la interfaz.
- [ ] Mostrar fechas en la zona del restaurante y explicar los servicios que cruzan medianoche.
- [ ] Verificar navegación con teclado, pantallas pequeñas, carga, errores, sesión vencida y turnos agotados durante la confirmación.
- [ ] Probar recorridos completos de cliente, personal y administrador contra la API real.

Cierre: una persona puede completar los recorridos del producto sin depender de Swagger, incluidos errores y recuperación de sesión.

## 3. Preparar seguridad y operación — etapa 7, pendiente

- [ ] Agregar límites de intentos para registro, login, renovación y consultas que puedan saturar la API.
- [ ] Restringir CORS a los dominios del producto. Actualmente `app.enableCors()` no aplica esa restricción; `NODE_ENV=production` no la configura automáticamente.
- [ ] Definir verificación de correo y recuperación de contraseña, con tokens de un solo uso y vencimiento. Elegir un proveedor de correo solo después de acordar alcance y costo.
- [ ] Definir si se requiere revocación inmediata de access tokens y cierre de todas las sesiones. Hoy logout revoca el refresh enviado; el access token dura hasta su expiración, salvo cuenta desactivada o permisos modificados en la base.
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
- [ ] Configurar HTTPS y conectividad de base restringida a los servicios que la necesitan.
- [ ] Inyectar `DATABASE_URL`, `JWT_ACCESS_SECRET`, expiraciones, `NODE_ENV` y `PORT` mediante el sistema de secretos del proveedor. No usar credenciales de `compose.yaml` ni copiar archivos `.env` locales.
- [ ] Configurar CI para instalación con lockfile, generación Prisma, compilación, pruebas, tipos e integración sobre PostgreSQL aislado.
- [ ] Definir ejecución de migraciones una sola vez por despliegue y permisos necesarios; no correr `prisma migrate dev` en producción.
- [ ] Crear un administrador inicial por el procedimiento de seed, sin credenciales predeterminadas y sin repetirlo automáticamente en cada arranque.
- [ ] Configurar copias de seguridad y retención; acordar cuánta pérdida de datos y tiempo de recuperación son aceptables.
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

Validación local realizada el 28 de octubre de 2026 antes de publicar este conjunto de cambios: compilación correcta, 15 pruebas aprobadas, chequeo de tipos y esquema Prisma correctos, integración PostgreSQL de las etapas 1–4 aprobada y revisión del diff sin errores de espacios. Esta validación no incluye pruebas de carga, frontend ni un despliegue en entorno de prueba.

Desde la raíz, con una base de desarrollo configurada y migrada:

```powershell
pnpm.cmd build
pnpm.cmd test
pnpm.cmd lint
pnpm.cmd --filter @repo/api exec prisma validate
pnpm.cmd --filter @repo/api test:integration
git diff --check
```

La integración crea y elimina únicamente sus usuarios, sucursales y recursos asociados. Nunca apuntarla a producción. Actualmente cubre las etapas 1–4; debe ampliarse al implementar asistencia, puntos y la interfaz.

Para un despliegue futuro, generar Prisma y compilar durante la construcción de la versión, aplicar las migraciones versionadas con `pnpm.cmd --filter @repo/api db:deploy` y arrancar con `pnpm.cmd --filter @repo/api start`, adaptando el ejecutable de pnpm al sistema operativo. La configuración de hosting, TLS, supervisión y respaldo sigue pendiente: estos comandos solos no completan un despliegue.

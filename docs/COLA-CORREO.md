# Cola persistente de correo

Implementada el 25 de noviembre de 2026. No requiere Redis, una cuenta externa ni un proceso adicional: PostgreSQL conserva los trabajos y la API ejecuta el trabajador. El modo `file` continúa escribiendo mensajes de prueba en el buzón privado; `smtp` utiliza el transporte ya existente. Todavía no se comprobó entrega con un proveedor real.

## Instalación y configuración

Desde la raíz, con la API detenida si Prisma tiene sus archivos bloqueados:

```powershell
pnpm.cmd --filter @repo/api exec prisma generate
pnpm.cmd --filter @repo/api exec prisma migrate deploy
pnpm.cmd build
pnpm.cmd dev
```

Las migraciones once y doce, `20261125000100_mail_queue` y `20261125000200_mail_queue_scope`, agregan `MailJob` y su separación por entorno sin modificar reservas, puntos ni cuentas existentes. No reconstruye mensajes que se hubieran perdido antes de instalar la cola. Reiniciar una API antigua no incorpora el trabajador: debe ejecutarse el código compilado actualizado.

Variables privadas en `apps/api/.env`:

```dotenv
MAIL_QUEUE_ENABLED=true
MAIL_QUEUE_SCOPE=main
# MAIL_QUEUE_KEY=<64 caracteres hexadecimales aleatorios>
```

En desarrollo, si se omite `MAIL_QUEUE_KEY`, se deriva una clave del secreto JWT existente con un dominio específico para correo. En producción se exige una clave independiente de 32 bytes y el trabajador habilitado. Para generar la clave, ejecutar localmente `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` y guardarla únicamente en el gestor de secretos o `.env` privado. No copiarla en documentación, Git ni capturas. Conservarla estable: cambiarla deja ilegibles los mensajes pendientes. No hay rotación automática ni soporte simultáneo para varias claves; vaciar pendientes antes de rotarla. Respaldar la clave separadamente de PostgreSQL y restringir ambos accesos.

En desarrollo, cambiar el secreto JWT también deja ilegibles los pendientes cuando se usa la clave derivada. No cambiar la clave para simular una falla de transporte: usar las pruebas automatizadas con dobles.

`MAIL_QUEUE_ENABLED=false` detiene solo el trabajador, pero sigue aceptando trabajos persistentes; es útil para pruebas locales. La API debe reiniciarse al cambiarlo. `MAINTENANCE_ENABLED` controla las limpiezas anteriores de sesiones/enlaces y buzón local; no desactiva la cola ni su retención. Producción requiere una API siempre activa, con PostgreSQL disponible. El trabajador no funciona con la aplicación suspendida.

`MAIL_QUEUE_SCOPE` identifica una cola y admite de 1 a 64 letras, números, guiones o guiones bajos; por defecto `main`. Solo se reclaman y limpian trabajos de ese identificador. Las instancias que comparten cola deben mantener el mismo scope, clave, transporte y URL pública. Cambiar el scope deja los pendientes anteriores sin trabajador: drenar antes o conservar una instancia con la configuración anterior. No es un permiso ni un secreto. Integración usa un scope aleatorio, y las suites general/seguridad scopes propios para que un trabajador de desarrollo no envíe sus mensajes al buzón equivocado. No ejecutar dos corridas de la misma suite contra una misma base simultáneamente.

## Flujo y protección de datos

Registro y correo de verificación se guardan en una misma transacción. Las solicitudes de verificación/recuperación guardan token y trabajo juntos. El restablecimiento guarda la nueva contraseña, revoca credenciales y encola el aviso dentro de su transacción: si no se puede encolar, no se confirma parcialmente el cambio. Las respuestas no esperan a SMTP y mantienen el mensaje genérico y el enfriamiento por destinatario.

El destinatario, asunto y cuerpo se cifran con AES-256-GCM, IV aleatorio y autenticación del contenido. `AccountActionToken` conserva solo el hash del token; la copia necesaria para entregar el enlace está dentro del contenido cifrado del trabajo, no en texto plano. Quien posea tanto la base como la clave podrá descifrar pendientes. Los archivos del buzón local siguen conteniendo texto y enlaces, con sus controles de acceso y retención específicos.

Estados: `pending`, `sent`, `failed`, `cancelled`. Cada trabajo pertenece a un usuario; eliminarlo elimina sus trabajos por cascada. Antes de entregar se comprueban cuenta activa, mismo correo y, para enlaces, token vigente que siga perteneciendo al usuario/correo. Consumir o reemplazar un enlace cancela su entrega pendiente. Una operación que ocurra justo después de esa comprobación puede adelantarse al envío: el correo podría llegar, pero el servidor seguirá rechazando el enlace consumido.

Al terminar se borran contenido cifrado y hash asociado del trabajo; quedan estado, contador, fechas y referencia al usuario. La limpieza elimina hasta 500 registros terminados hace más de siete días por pasada. No registra destinatarios, contenidos, rutas, tokens, errores SQL ni respuestas del proveedor.

## Reintentos y reinicios

El trabajador busca cada segundo, sin superponer ejecuciones en su proceso, y atiende hasta diez trabajos por pasada. PostgreSQL reclama cada uno de forma atómica con `FOR UPDATE SKIP LOCKED`, incrementa su contador y concede una reserva de 120 segundos. Otros trabajadores pueden reclamar otros trabajos. Las confirmaciones incluyen el contador del intento para impedir que un trabajador atrasado confirme un intento posterior.

Máximo cinco intentos. Después de fallar, espera 30 segundos, 2 minutos, 10 minutos y 30 minutos, respectivamente. Todos los errores de transporte reciben el mismo tratamiento acotado. Los enlaces vencen desde su solicitud: 15 minutos para recuperación y 24 horas para verificación; las esperas no extienden su validez. El aviso de contraseña tiene un plazo de entrega de 24 horas. Un trabajo vencido o con cinco intentos abandonados pasa a `failed` cuando vuelve a estar disponible y se limpia su contenido. El usuario puede solicitar un enlace nuevo respetando el enfriamiento.

Si se corta el proceso después de reclamar y antes de confirmar, el pendiente vuelve a ser elegible al terminar la reserva. **Puede entregarse un correo repetido** si SMTP lo aceptó y se perdió la confirmación, o si el transporte tarda más que la reserva. No se promete entrega exactamente una vez, llegada a la bandeja ni ausencia de spam. El token sigue siendo de uso único. El plazo de reserva no cancela físicamente una conexión SMTP; se mantienen los timeouts del transporte. El cierre espera el trabajo activo y no inicia nuevos; el hosting debe permitir cierre ordenado y reinicio.

## Comprobación y operación

```powershell
pnpm.cmd --filter @repo/api test -- --runInBand
pnpm.cmd --filter @repo/api test:integration
pnpm.cmd --filter @repo/web test:security
```

La integración de cola usa tablas temporales de conexión, con estructura real y una adaptación de acceso para evitar que Prisma use tablas públicas; no reclama trabajos reales. Comprueba cifrado, fallo/reintento, una nueva instancia leyendo el pendiente, reclamos competidores, agotamiento, vencimiento, cancelación, retención y UTC en Pacific/Auckland. El resto de la integración prueba registro y flujos de cuenta completos contra sus usuarios temporales. El transporte de fallo es un doble, no SMTP real. Reiniciar la instancia comprueba recuperación de datos persistidos, sin simular un corte físico del servidor PostgreSQL.

Los avisos de consola son genéricos: `mail delivery deferred for retry`, `mail delivery exhausted retries` o `mail queue unavailable; next scheduled run will retry`. Para revisar acumulación con un cliente SQL autorizado, sin leer cuerpos ni direcciones:

```sql
SELECT scope, status, count(*) AS cantidad, min("createdAt") AS mas_antiguo
FROM "MailJob" GROUP BY scope, status;
```

No hay endpoint público para listar correos ni botón para reenviar trabajos fallidos. Evitar editar filas para probar: usar las pruebas automatizadas. Antes de publicar faltan proveedor/costo, remitente/dominio, entrega SMTP real, alertas externas de acumulación/fallos, límites de conexión/carga y ejercicio de respaldo/restauración con su clave. Readiness sigue comprobando conectividad de PostgreSQL, no garantiza que la cola esté vacía ni que SMTP funcione.

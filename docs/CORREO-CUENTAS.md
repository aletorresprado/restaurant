# Recuperación de contraseña y verificación de correo

Implementación local del 12 de noviembre de 2026. Incluye API, pantallas y transporte de correo; el envío real todavía requiere configurar un proveedor SMTP y verificar el remitente. No se creó una cuenta ni se contrató un servicio.

## Instalación

Se agregó Nodemailer y la décima migración `20261112000100_account_actions`, aplicada en la base local. Agrega `User.emailVerifiedAt`, `User.authVersion` y enlaces de cuenta con propósito y hash; conserva usuarios, roles, puntos y reservas. Las cuentas existentes quedan sin correo verificado y pueden seguir operando. Antes de producción se debe decidir si verificar será obligatorio para alguna operación; este incremento no cambia las reglas de reservas.

En otra instalación, detener la API si Windows mantiene bloqueada la DLL de Prisma y ejecutar desde la raíz:

```powershell
pnpm.cmd install --frozen-lockfile
pnpm.cmd db:generate
pnpm.cmd --filter @repo/api db:deploy
pnpm.cmd build
pnpm.cmd dev
```

No copiar encima de un `.env` existente. Con los valores predeterminados se usa un buzón **local de archivos**, no un envío de correo a internet:

```dotenv
MAIL_MODE=file
PUBLIC_WEB_URL=http://127.0.0.1:5173
MAIL_OUTBOX_DIR=.local/mail
```

El modo de archivos solo permite enlaces a localhost/127.0.0.1/::1 y se rechaza en producción. `PUBLIC_WEB_URL` es el origen exacto de la web, sin ruta ni barra final: no se obtiene del encabezado Host del solicitante.

## Prueba manual local, paso a paso

1. Abrir la app y elegir **Ingresar → Olvidé mi contraseña**, o **Verificar mi correo**. Una sesión sin verificar también muestra el enlace de verificación.
2. Ingresar el correo y pulsar **Enviar enlace**. Se devuelve el mismo mensaje para una cuenta activa, inexistente o desactivada. Revisar spam solo tiene sentido al activar SMTP real.
3. Abrir en el explorador/editor la carpeta `apps/api/.local/mail`. El archivo JSON más reciente del destinatario contiene el texto del mensaje y el enlace. Copiar el enlace completo en el navegador. No compartir ni versionar estos archivos: contienen enlaces que permiten cambiar la contraseña o verificar el correo.
4. Para recuperar, escribir la contraseña nueva y su confirmación y pulsar **Guardar contraseña**. Para verificar, pulsar **Confirmar correo**. Abrir el enlace por sí solo no ejecuta ninguna acción.
5. Tras recuperar, ingresar nuevamente con la contraseña nueva. Al verificar, el aviso se actualiza en la pestaña con sesión o al recargar las otras pestañas.

El alta de un usuario solicita la verificación en segundo plano. Si no llega, puede pedirse de nuevo desde la pantalla de correo. La carpeta de buzón está ignorada por Git y bloqueada por la configuración de archivos del servidor Vite. No existe una API pública que permita consultar mensajes o recuperar sus tokens. En Windows los permisos del archivo dependen de las ACL locales: usar un equipo/carpeta privados. Los mensajes se conservan hasta que el operador los retire; su limpieza automática sigue pendiente.

Para encontrar el archivo correcto en Windows, ordenar por **Fecha de modificación**, del más nuevo al más antiguo. Comprobar `to` (destinatario) y `subject` (Restablecer contraseña o Verificar correo). Copiar desde `http://` hasta el último carácter del token, sin comillas ni el `\n` que separa las líneas del JSON. Usar una cuenta ya registrada para recuperación; un correo inexistente recibe la misma respuesta, pero no genera archivo. Una cuenta ya verificada tampoco recibe otro enlace de verificación.

Resultados esperados: la nueva contraseña permite ingresar y la anterior deja de servir; las sesiones previas requieren un nuevo ingreso. Tras confirmar el correo, aparece **Correo verificado. Gracias por confirmar.** y al recargar una pestaña con sesión desaparece su aviso. Si falta el token después de recargar, reabrir el mensaje; si el enlace venció o fue usado, solicitar otro y respetar la espera de 60 segundos. No compartir los archivos para pedir soporte: describir el mensaje de error sin incluir el enlace.

## Contrato y seguridad

| Acción | Endpoint POST | Cuerpo |
| --- | --- | --- |
| Solicitar recuperación | `/api/v1/auth/forgot-password` | `email` |
| Solicitar verificación | `/api/v1/auth/request-email-verification` | `email` |
| Restablecer | `/api/v1/auth/reset-password` | `token`, `password`, `confirmPassword` |
| Verificar | `/api/v1/auth/verify-email` | `token` |

Los endpoints son públicos y aparecen en Swagger bajo `auth/account`; no requieren Bearer para usar un enlace recibido. Nunca devuelven el token en la respuesta de solicitud. Las confirmaciones inválidas, vencidas, consumidas, de otro propósito o de cuentas desactivadas devuelven 400.

- Token aleatorio de 256 bits, almacenado como SHA-256 en PostgreSQL. Un enlace activo por cuenta y propósito. Reset: 15 minutos; verificación: 24 horas.
- Una solicitud aceptada dentro de los últimos 60 segundos para la misma cuenta/propósito no genera otro mensaje. Después puede reemplazar el enlace anterior, que deja de servir. Esta espera persiste en la base; los límites IP se mantienen en memoria.
- Solicitudes con respuesta genérica y demora mínima de 350 ms; el tiempo de entrega SMTP no forma parte de la respuesta. No se garantiza tiempo constante bajo carga/errores de base. Registro conserva su contrato anterior, incluido el conflicto si el correo ya existe.
- Cuota IP compartida de 5 solicitudes de enlaces cada 15 minutos (`RATE_LIMIT_ACCOUNT_REQUEST`) y 30 confirmaciones cada 15 minutos (`RATE_LIMIT_ACCOUNT_CONFIRM`). Un 429 indica la espera; la web no repite automáticamente. El enfriamiento por destinatario limita ráfagas, pero no sustituye supervisión de abuso de correo ni controles del proveedor.
- El enlace usa `#token=...`, que no viaja en el GET al servidor. La web lo lee en memoria y lo retira de la dirección mediante `replaceState`; no lo guarda en localStorage/sessionStorage. Solo se envía en el cuerpo del POST al confirmar. Recargar después de retirar el fragmento requiere volver a abrir el mensaje.
- No se consume un enlace por GET: evita que una vista previa del correo lo utilice por accidente. La confirmación se serializa por usuario y vuelve a consultar el token bajo bloqueo. Dos confirmaciones simultáneas solo pueden aplicar una vez.
- Restablecer usa la misma política de contraseña y bcrypt 12 que el registro. Cambia el hash, incrementa `authVersion`, elimina sesiones y enlaces pendientes y limpia la pausa de ingreso del proceso. No inicia sesión automáticamente ni marca el correo como verificado implícitamente. Envía un aviso sin incluir la contraseña.
- Los JWT nuevos incluyen `av`; los antiguos sin esa marca se interpretan como versión cero. El guard compara contra la base: tras un reset no sirven JWT anteriores, además de quedar revocadas cookies y renovaciones. Un login/refresh con credenciales viejas no puede crear una sesión válida después del reset; se coordina mediante bloqueo de usuario. Operaciones ya autorizadas/en curso pueden terminar.
- El restablecimiento local del operador también incrementa la versión y revoca enlaces/sesiones. Logout Bearer normal mantiene su contrato de revocar el refresh presentado; no constituye cierre global de JWT. Cierre global explícito sigue pendiente.

Referencia: [OWASP Forgot Password](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html).

## Activar correo real

Configurar en el `.env` privado:

```dotenv
MAIL_MODE=smtp
PUBLIC_WEB_URL=https://dominio-del-proyecto.example
SMTP_HOST=servidor-smtp-del-proveedor
SMTP_PORT=587
SMTP_USER=usuario-del-proveedor
SMTP_PASSWORD=credencial-del-proveedor
MAIL_FROM=remitente@dominio-del-proyecto.example
```

Son ejemplos, no credenciales funcionales. Puerto 465 usa TLS desde el inicio; otros puertos exigen STARTTLS y validación de certificado. No se habilitan logs de mensajes, lectura de adjuntos ni descarga de archivos/URL. Referencia: [Nodemailer SMTP](https://nodemailer.com/smtp).

Producción exige SMTP completo, `PUBLIC_WEB_URL` HTTPS explícito y que ese origen figure en `WEB_ORIGINS`. Antes de activar el envío: acordar proveedor/costo, validar dominio/remitente y sus registros SPF/DKIM/DMARC, probar entrega y spam y definir soporte si alguien no reconoce un cambio. No se ha comprobado entrega SMTP real en esta implementación.

La entrega se dispara en segundo plano y registra únicamente un aviso genérico si falla, sin destinatario, token ni detalle del proveedor. **Todavía no hay cola persistente ni reintentos automáticos**: una caída puede perder un mensaje; el usuario podrá solicitar otro al terminar la espera. Configurar cola/retención, limpieza de tokens vencidos, supervisión y pruebas del proveedor antes de publicar. Las alertas de cambio tampoco tienen garantía de entrega sin esa infraestructura.

## Validación

Compilación, tipos, pruebas unitarias/HTTP, integración PostgreSQL y `pnpm.cmd --filter @repo/web test:security`. La integración cubre hash, propósito, caducidad, enfriamiento, consumo simultáneo, revocación de cookie/refresh/JWT y competencia con login/renovación, sin cambiar roles o puntos. El navegador usa un buzón privado de pruebas y verifica las dos pantallas, eliminación del fragmento, confirmación manual y rechazo del enlace usado. El transporte SMTP se prueba con un doble, sin enviar a destinatarios reales. El script de restablecimiento local tiene su propia prueba PostgreSQL con cuentas temporales.

**Aceptación manual — 12 de noviembre de 2026:** el propietario confirmó que completó satisfactoriamente los dos recorridos explicados: solicitud y recuperación de contraseña con el buzón local, e ingreso al enlace y confirmación de correo. Informó que pudo realizar todas las pruebas indicadas. No se registran contraseñas, destinatarios reales ni enlaces utilizados. Las verificaciones de TTL, concurrencia y revocación se respaldan además con las pruebas automáticas; no se atribuye a esta aceptación una prueba de espera de 24 horas o envío SMTP real.

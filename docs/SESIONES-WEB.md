# Sesiones de la web

Actualizado el 11 de noviembre de 2026. La web utiliza sesiones opacas con cookies HttpOnly, independientes por pestaña. Swagger conserva su contrato Bearer/JWT.

## Ingreso, recarga y salida

- La web llama a `/api/v1/auth/web/login` o `/register` y recibe solo `{ user }`. No recibe access/refresh tokens en JSON ni los guarda en almacenamiento o URLs.
- El servidor genera un secreto aleatorio de 48 bytes, guarda su hash SHA-256 en Session y lo envía exclusivamente por Set-Cookie HttpOnly. Cada sesión tiene un UUID de pestaña y vencimiento absoluto de ocho horas por defecto (`WEB_SESSION_HOURS`, entre 1 y 24).
- sessionStorage conserva únicamente el UUID público de pestaña (`app-resto-web-tab-v1`). No identifica al usuario ni autentica sin su cookie. El perfil permanece en memoria y se verifica con `/auth/me` tras recargar.
- Web Locks impide restaurar una copia del mismo UUID en otra pestaña. La copia pide login sin revocar la original. Sin Web Locks o almacenamiento, un nuevo ingreso puede funcionar en memoria, pero no restaurarse tras recargar. Confirmar reservas requiere la coordinación de [RECUPERACION-RESERVAS.md](RECUPERACION-RESERVAS.md).
- Cada petición privada envía X-Web-Session y cookies del mismo origen. Se comprueban hash, pestaña, vencimiento y cuenta activa, utilizando el rol actual de la base. Un 401 pide login; la web no rota JWTs.
- Al ingresar con otra cuenta desde una pestaña ya propia, se revoca la sesión anterior antes de activar la nueva. Nunca se revoca una sesión por el mero UUID copiado de otra pestaña.
- `/auth/web/logout` elimina esa sesión de la base y borra su cookie. Una petición nueva con la cookie anterior se rechaza inmediatamente. No cierra otras pestañas ni deshace operaciones ya autorizadas/enviadas.
- Si no se puede contactar al servidor para salir, se informa el error y se conserva la sesión para reintentar. Repetir logout tras perder su respuesta es seguro.
- Se descartan respuestas de otro inicio de sesión, incluso de la misma cuenta. Una escritura que pudo aplicarse se trata como incierta; no se reenvía automáticamente bajo otra cuenta.

Las cookies no llevan Domain, Max-Age ni Expires: son cookies de sesión del navegador. En producción se llaman `__Host-resto-web-<uuid>`, con Secure, HttpOnly, SameSite=Strict y Path=/. En desarrollo se llaman `resto-web-<uuid>`, con HttpOnly, SameSite=Strict y Path=/api/v1, sin Secure para localhost. Salir explícitamente sigue siendo necesario en equipos compartidos: algunos navegadores restauran cookies y pestañas al recuperar una sesión. El servidor impone siempre su vencimiento absoluto.

## Origen, CSRF y despliegue

Web y /api/v1 deben compartir origen público. Vite proporciona el proxy local. El cliente usa credentials=same-origin, sin cookies entre orígenes; rechaza un VITE_API_BASE_URL de otro origen al ingresar.

Las operaciones web requieren UUID de pestaña y Origin dentro de WEB_ORIGINS. Se rechazan escrituras sin Origin, Origin=null, un origen distinto y Sec-Fetch-Site=cross-site. Las lecturas con Origin también se validan. Sin X-Web-Session, el guard exige Bearer: no acepta cookies ambientales al navegar a un endpoint. Cookies ambiguas con el mismo nombre se rechazan.

CORS se restringe a WEB_ORIGINS y no permite credenciales entre orígenes. Producción exige una lista explícita de orígenes HTTPS exactos, sin rutas ni barra final, no inferidos del Host de una petición. La API emite Cache-Control=no-store, X-Content-Type-Options=nosniff y Referrer-Policy=no-referrer.

Referencias: [HttpOnly y cookies, RFC 6265](https://www.rfc-editor.org/rfc/rfc6265), [Fetch Metadata, W3C](https://www.w3.org/TR/fetch-metadata/) y [Web Locks, W3C](https://www.w3.org/TR/web-locks/).

## Privacidad y migración

La octava migración, `20261111000200_browser_sessions`, agrega Session.browserTabId nullable. Conserva usuarios, contraseñas, reservas, puntos y sesiones Bearer existentes. Los endpoints antiguos de login/refresh/logout mantienen su contrato; una cookie web no puede intercambiarse por JWT en /auth/refresh.

La web elimina el antiguo app-resto-session-v1 y solicita login de nuevo; no migra ni publica sus tokens. Los JWT emitidos antes conservan su vigencia anterior. La revocación inmediata aquí corresponde a cookies, sin cierre global de dispositivos.

Resolver una confirmación elimina su registro local, sin conservar fechas, grupo e ID de reserva. Ingreso/restauración también limpia resultados completados de esa cuenta guardados por la versión anterior. El UUID de una selección copiada permite reconocer el reenvío en la API. Al salir se limpia la selección de horario de esa pestaña.

Las confirmaciones **pendientes** se conservan por cuenta para recuperarlas al volver a ingresar, incluidos fecha, sucursal y grupo, sin credenciales. No borrarlas ciegamente tras un corte. En equipos compartidos, salir explícitamente y revisar pendientes. Los ajustes administrativos guardan solo borradores/pendientes en localStorage, compartidos por administrador/cliente, y los eliminan al resolver. Se migran los pendientes antiguos de sessionStorage al seleccionar su cliente. Ver [RECUPERACION-GESTION.md](RECUPERACION-GESTION.md).

HttpOnly impide leer el secreto desde JavaScript, pero un XSS activo todavía puede ejecutar acciones o leer respuestas con una sesión abierta. CSP y límites por IP/correo están implementados localmente. La recuperación/verificación está implementada con buzón local/adaptador SMTP; al restablecer, authVersion invalida los JWT anteriores y se eliminan todas las sesiones de la cuenta. Los logins/refresh coordinan con el cambio mediante bloqueo de usuario. Siguen pendientes encabezados del hosting real, entrega SMTP y cola persistente, limpieza de sesiones, cierre global explícito y validación del despliegue. Las pestañas cerradas sin logout pueden dejar cookies/sesiones que vencen en el servidor; su mantenimiento corresponde a la etapa 7. Esta entrega no constituye un despliegue productivo.

## Instalación y pruebas

Conservar el .env propio, revisar .env.example y detener la API si Windows bloquea la DLL de Prisma:

```powershell
pnpm.cmd --filter @repo/api db:generate
pnpm.cmd --filter @repo/api db:deploy
pnpm.cmd build
pnpm.cmd dev
```

No hay dependencias ni servicios nuevos. En desarrollo WEB_ORIGINS admite http://127.0.0.1:5173 y http://localhost:5173. En producción configurar NODE_ENV=production, WEB_ORIGINS=https://dominio-del-producto y HTTPS en el proxy.

La integración PostgreSQL verifica cookies/flags, ausencia de secretos en JSON, hash persistido, CSRF/origen, cookies ambiguas, pestañas, roles actuales, cuenta inactiva, expiración, revocación y compatibilidad Bearer. El navegador comprueba recarga, copia de pestaña, cuentas independientes, logout aislado, HttpOnly y ausencia de secretos en almacenamiento, además de recorridos de reservas y gestión.

Validado: compilación, tipos, esquema Prisma, 42 pruebas unitarias (20 API + 22 web), integración PostgreSQL y suite completa de dieciocho recorridos de navegador; seis recorridos de gestión/sesiones repetidos tras el ajuste final de cambio de cuenta, todos aprobados.

# Sesiones de la web

## Política actual

Cada pestaña inicia su propia sesión contra la API. Puede usar la misma cuenta u otra. Cerrar sesión revoca únicamente el refresh token de esa pestaña; no cierra las demás. La pantalla de ingreso explica este alcance. Los access tokens ya emitidos siguen vigentes hasta vencer, según el contrato actual de la API.

Recargar restaura la sesión desde `sessionStorage` y consulta `/auth/me`. No se colocan tokens en `localStorage`, URLs ni mensajes entre pestañas. Las respuestas privadas se solicitan sin caché HTTP.

Al duplicar una pestaña, el navegador puede copiar `sessionStorage`. Cada sesión restaurable mantiene un bloqueo exclusivo del navegador mediante [Web Locks](https://www.w3.org/TR/web-locks/), con un identificador aleatorio sin credenciales. La copia que no obtiene ese bloqueo elimina su copia local y solicita iniciar sesión, sin renovar ni revocar la sesión original. Una pestaña que inicia sesión de nuevo obtiene tokens y un identificador propios. El navegador libera el bloqueo al destruir el documento; una recarga puede adquirirlo nuevamente.

Las sesiones anteriores sin identificador usan una huella SHA-256 del refresh token para detectar copias; el token no se usa como nombre del bloqueo. Después de actualizar una instalación con pestañas antiguas abiertas, recargarlas para que todas ejecuten la protección nueva.

Sin Web Locks, o si el navegador rechaza utilizarlos, un nuevo login funciona solo en memoria: al recargar se requiere otro ingreso. Una sesión persistida no se restaura sin poder obtener la protección. Si el almacenamiento está bloqueado, la sesión también puede funcionar en memoria. Web Locks requiere un contexto seguro (HTTPS o localhost para desarrollo); verificar compatibilidad en los navegadores del despliegue.

## Renovación y cambios de cuenta

- Las peticiones concurrentes de una sesión comparten una sola renovación. Sesiones independientes nunca comparten esa promesa.
- Una renovación o un logout demorado de la sesión anterior no reemplaza ni elimina un nuevo login.
- Las respuestas autenticadas se comprueban contra la identidad del inicio de sesión que las originó, incluso si se volvió a ingresar con la misma cuenta. No se reenvía una petición antigua bajo el nuevo login.
- Si una escritura devolvió éxito después de cambiar de sesión, su resultado se trata como incierto. Puede haberse aplicado: consultar el estado con la cuenta original antes de repetirla. Esta protección no cancela una operación ya recibida por el servidor.
- Logout espera la renovación de su propia sesión. Si no logra revocar el refresh, muestra el error y conserva la sesión para reintentar.

## Límites y trabajo pendiente

Esta entrega conserva el contrato de autenticación de la API y sus permisos. No agrega cookies HttpOnly, cierre global de sesiones, revocación inmediata de access tokens ni recuperación pública por correo. Los tokens de `sessionStorage` siguen accesibles a JavaScript del mismo origen: la exclusión entre pestañas no protege contra XSS. Antes de producción, resolver cookies/BFF o justificar el almacenamiento elegido con controles CSP/XSS, HTTPS y CORS.

La política de sesión no evita dos reservas o ajustes distintos iniciados deliberadamente en pestañas independientes. La creación de reservas aún no tiene clave de idempotencia. Los ajustes de puntos conservan su UUID para repetir la misma operación, pero dos UUID representan dos ajustes. Siguen pendientes la recuperación de operaciones inciertas tras recargas y la coordinación de intenciones entre pestañas. La etapa 6 permanece abierta por estos límites y la revisión de almacenamiento para producción.

## Comprobaciones

Pruebas unitarias del cliente: renovación concurrente, errores sin reenvío, cambios de cuenta con lecturas/escrituras pendientes, reingreso de la misma cuenta y logout demorado, además de binarios/multipart.

`e2e/sessions.spec.ts` usa PostgreSQL local y cuentas temporales: recarga, copia real con `window.open`, rechazo de la copia sin revocar la original, login independiente de la misma cuenta, otra cuenta, dos renovaciones simultáneas, logout aislado y navegador sin Web Locks. Se ejecuta en escritorio y móvil. No usa ni altera las cuentas personales.

La suite actual reúne 33 pruebas unitarias (17 API y 16 web) y dieciséis recorridos de navegador, además de chequeo de tipos del monorepo y compilación web. La herramienta local de restablecimiento de contraseña tiene una prueba PostgreSQL separada, documentada en README; no se cuenta entre las 33 unitarias.

```powershell
pnpm.cmd test
pnpm.cmd lint
pnpm.cmd --filter @repo/web build
pnpm.cmd --filter @repo/web test:e2e
git diff --check
```

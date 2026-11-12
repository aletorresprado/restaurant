# Política de seguridad del navegador (CSP)

Implementada el 12 de noviembre de 2026, dentro de la etapa 7. No agrega dependencias, migraciones ni servicios externos.

## Qué protege

CSP indica al navegador qué scripts, estilos, imágenes y conexiones permite la aplicación. Ayuda a limitar el impacto de una inyección de código. Complementa la validación, los permisos y las cookies HttpOnly; no los sustituye. Es una política basada en orígenes, no una garantía de que cualquier recurso del mismo origen sea seguro. Referencia: [Content-Security-Policy, MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy).

## Web compilada

La configuración se mantiene en `apps/web/security-policy.ts` y Vite la aplica durante la compilación:

- Scripts y conexiones HTTP solamente al mismo origen. Sin `unsafe-inline`, `unsafe-eval` ni servidores externos de scripts.
- Estilos propios y Google Fonts; fuentes propias y `fonts.gstatic.com`. Se conservan las tipografías del diseño de Lovable.
- Imágenes del mismo origen, `blob:` para vistas previas e imágenes `data:`. Las imágenes de sucursales siguen llegando desde nuestra API.
- Formularios al mismo origen; se prohíben base URL, objetos y marcos incrustados.
- El HTML generado incluye una etiqueta CSP al comienzo del head, antes de los recursos. Funciona también al servir los archivos con otro servidor estático.

`pnpm.cmd --filter @repo/web preview` devuelve además CSP por cabecera, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy: no-referrer` y una política que deshabilita cámara, micrófono y geolocalización, funciones que la aplicación no utiliza.

La compilación genera `apps/web/dist/security-headers.json` con los valores exactos para configurar el servidor/CDN. **El archivo JSON no configura automáticamente el hosting.** Al elegir proveedor, aplicar esos encabezados a los documentos de la SPA, incluidas las rutas que devuelven `index.html`, y verificar la respuesta real. No reemplazar la política de `/api/docs` con la de la SPA.

La etiqueta meta no admite `frame-ancestors` ni sustituye encabezados HTTP como `X-Frame-Options`: la protección contra ser incrustada en otros sitios exige la cabecera en el servidor real. Vite preview sirve para verificar localmente el build, no es el servidor de producción elegido.

## Desarrollo

El servidor Vite devuelve una política distinta: permite scripts y estilos inline que necesitan React Refresh y la inyección de CSS, y conexiones WebSocket a localhost/127.0.0.1 para HMR. No permite `unsafe-eval`. Estas excepciones no aparecen en el HTML compilado ni en sus encabezados de preview. Referencia: [opciones del servidor Vite](https://vite.dev/config/server-options.html).

`API_PROXY_TARGET` es una variable del proceso Vite para dirigir su proxy a otra API durante pruebas aisladas; por defecto usa `http://127.0.0.1:3000`. No se incorpora al código del navegador. La SPA y `/api/v1` siguen compartiendo origen; no cambia la política de cookies/CORS.

## API y Swagger

Nest aplica encabezados de seguridad a la API y a Swagger. Las respuestas normales usan `default-src 'none'`, prohíben ser incrustadas y conservan `Cache-Control: no-store`.

Swagger conserva sus recursos y scripts del mismo origen; su plantilla necesita `style-src 'unsafe-inline'`. Esa excepción se limita a `/api/docs` y sus recursos: no habilita scripts inline ni eval y no se traslada a la web compilada. Se deshabilita el validador externo y no se persiste la autorización Bearer en el navegador. Swagger sigue siendo una herramienta de desarrollo; su protección o desactivación en producción continúa pendiente.

No se fuerza HTTPS/HSTS en localhost. La configuración real de TLS, CORS, proxies y HSTS se resolverá con la infraestructura. La política no publica el proyecto ni completa la preparación de producción.

## Cómo comprobar

Con PostgreSQL de desarrollo migrado y Chromium instalado:

```powershell
pnpm.cmd build
pnpm.cmd test
pnpm.cmd lint
pnpm.cmd --filter @repo/api test:integration
pnpm.cmd --filter @repo/web test:security
```

`test:security` usa procesos exclusivos en los puertos 3002 (API), 5180 (preview compilado) y 5181 (desarrollo). No reutiliza servicios ni modifica el `.env` real. Los doce recorridos de escritorio/móvil verifican reserva, login, cancelación, encuesta, imágenes y gestión de sucursales en el build; también bloqueo efectivo de script inline/conexión externa, carga de Swagger, arranque de desarrollo y pausa por fallos de ingreso, recuperación de contraseña y verificación de correo. El proceso temporal usa cuotas altas para sus fixtures, sin cambiar los límites de la aplicación habitual. El control por correo conserva sus valores predeterminados de cinco fallos y 60 segundos. Al terminar deben cerrarse sus tres servidores.

La suite general `test:e2e` mantiene sus recorridos contra Vite de desarrollo. La suite de seguridad es separada para poder probar las restricciones reales del build, que son diferentes de HMR.

Resultado local: build y tipos correctos, 61 pruebas (28 API + 33 web), integración PostgreSQL y **ocho recorridos de seguridad aprobados en 44,4 segundos**. Las primeras corridas tuvieron esperas agotadas en transiciones y una desconexión temporal de PostgreSQL, sin violaciones CSP en esas transiciones. Tras comprobar la base y usar esperas de aserciones de 15 segundos, la última corrida aprobó completa fuera del sandbox y cerró sus procesos. Una corrida previa en sandbox dejó esperando el cierre de sus servidores; se cerraron exclusivamente sus tres árboles identificados. También hubo mensajes `StreamableFile: Premature close` durante navegaciones que interrumpen imágenes; no provocaron fallos de aserciones en la corrida final. No se cambiaron reglas de negocio para superar las pruebas.

Ampliación de fallos por cuenta: 68 pruebas (35 API + 33 web), integración PostgreSQL y diez recorridos de seguridad aprobados en 50,4 segundos. El nuevo recorrido verifica cinco contraseñas incorrectas y un ingreso en pausa, sin sesión emitida ni cuenta desactivada. Esta corrida cerró normalmente sus servidores temporales.

Pendiente antes de publicar: configurar encabezados en el hosting real y comprobar CSP/HTTPS con las rutas de la SPA, fuentes, imágenes y API; repetir recorridos completos, revisar accesibilidad/rendimiento y dependencias. No se agregó un receptor de informes CSP: las violaciones se observan en la consola y en las pruebas del navegador.

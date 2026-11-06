# Frontend del cliente

Integrado el 30 de octubre de 2026 en `apps/web`. Origen visual: [pixel-perfect-replica](https://github.com/aletorresprado/pixel-perfect-replica), commit `2334e0f5758dcb0c6fc4387801165c2c4ab0c21c` revisado localmente. Se conservan la identidad marfil/oliva/terracota, tipografías, imagen principal, componentes y recorrido del cliente. La implementación usa React, TypeScript, Tailwind y TanStack Router sobre Vite, sin el servidor de TanStack Start ni el paquete de configuración de Lovable.

El repositorio de Lovable permanece separado y sin modificaciones. Esta integración es una copia adaptada, no una sincronización automática entre repositorios.

## Alcance

Actualización del 6 de noviembre de 2026: Mesas, Horarios y Bloqueos temporales para ADMIN/STAFF autorizado, además de estrellas de color junto al nombre de los niveles. Compilación web, tipos, 28 pruebas de API/web y doce recorridos de navegador aprobados. La conversión de fechas declara date-fns/date-fns-tz en la web, con versiones ya usadas por el monorepo; no cambia backend ni migraciones. Ver [MESAS-WEB.md](MESAS-WEB.md), [HORARIOS-WEB.md](HORARIOS-WEB.md) y [BLOQUEOS-WEB.md](BLOQUEOS-WEB.md).

Actualización del 3 de noviembre de 2026: agenda y administración verificadas con compilación, tipos, 23 pruebas de API/web y cuatro recorridos de navegador aprobados, incluidos roles, puntos y reintentos después de una respuesta de red perdida. Detalles en [GESTION-WEB.md](GESTION-WEB.md).

Actualización del 4 de noviembre de 2026: formularios de sucursales y elección de imágenes propias para las tarjetas del inicio. Se cubren altas, edición, estados, conflictos de reservas, catálogo público y respuesta incierta de creación; también subida, reemplazo y borrado de fotos con persistencia PostgreSQL. Esta última función agrega una migración y endpoints de imágenes, sin modificar reglas de reservas. Ver [IMAGENES-SUCURSALES.md](IMAGENES-SUCURSALES.md). Validación: compilación, tipos, 25 pruebas de API/web, integración PostgreSQL ampliada y recorridos de escritorio/móvil.

- Inicio con sucursales activas reales; carga, error, reintento y estado vacío.
- Consulta pública de disponibilidad por sucursal, fecha de servicio y grupo.
- Registro y login reales usando los esquemas de validación compartidos.
- Conservación de la selección durante el acceso y al recargar la pestaña.
- Confirmación, referencia UUID y detalle con eventos de la API.
- Mis reservas paginado, incluyendo anteriores y canceladas.
- Desde el 3 de noviembre de 2026: saldo, nivel e historial de puntos paginado en Mis reservas; encuesta de calificación para visitas con asistencia y finalizadas, con recompensa única y persistencia al recargar. Ver [FIDELIZACION.md](FIDELIZACION.md).
- Cancelación con confirmación y motivo opcional, según la regla vigente del backend.
- Restauración de sesión, renovación coordinada por pestaña y logout con revocación del refresh token.

Desde el 3 de noviembre hay agenda para STAFF/ADMIN y administración de usuarios, asignaciones y puntos para ADMIN. Desde el 4 de noviembre, ADMIN dispone de formularios para sucursales y sus imágenes; desde el 6, STAFF/ADMIN también gestionan mesas, horarios, excepciones y bloqueos según sus sucursales autorizadas. Ver [MESAS-WEB.md](MESAS-WEB.md), [HORARIOS-WEB.md](HORARIOS-WEB.md) y [BLOQUEOS-WEB.md](BLOQUEOS-WEB.md). El login dirige al área del rol; la confirmación de nuevas reservas sigue reservada a CUSTOMER. Los niveles muestran estrellas de color con nombre. Queda revisar sesiones/almacenamiento y coordinación entre pestañas antes de producción.

## Inicio local

Primero configurar PostgreSQL y la API según el README. Desde la raíz:

```powershell
pnpm.cmd install --frozen-lockfile
pnpm.cmd build
pnpm.cmd dev
```

`dev` inicia la API y el frontend. Si la API ya está corriendo, iniciar únicamente la web:

```powershell
pnpm.cmd --filter @repo/web dev
```

Web: http://127.0.0.1:5173. API: http://127.0.0.1:3000. Vite reenvía `/api` a la API local, por lo que no fue necesario modificar sus reglas ni su configuración CORS.

No se crean sucursales, cuentas o reservas de demostración al iniciar. Si la base no tiene sucursales activas, la página lo informa. Crear los datos operativos reales mediante la API y el procedimiento de administrador inicial.

Para pruebas locales iniciales también se puede ejecutar `pnpm.cmd --filter @repo/api db:seed:dev`: crea explícitamente una sucursal identificada como desarrollo, tres mesas y horarios diarios. Solo permite la base local `app_resto_dev` en modo development; no modifica ni duplica una sucursal ya creada por ese comando y no crea usuarios. Ver README.

## Configuración y despliegue futuro

`VITE_API_BASE_URL` es opcional; por defecto `/api/v1`. Ver `apps/web/.env.example`. La URL se incorpora durante el build y está declarada como entrada de caché de Turbo. No colocar secretos en variables `VITE_*`: el navegador puede leerlas.

El build genera `apps/web/dist`. Para producción hace falta alojamiento estático con fallback de rutas hacia `index.html` y un proxy HTTPS para `/api`, o una URL de API HTTPS con los orígenes CORS autorizados. El proxy de Vite es para desarrollo; no reemplaza la configuración del alojamiento.

## Adaptaciones al comportamiento real

- Un servicio por día de semana; no se agregaron almuerzo/cena ni nuevos turnos al backend.
- La selección usa `startAt` y `endAt` UTC de la disponibilidad, junto con `serviceDate`. No se reconstruyen instantes usando la zona del dispositivo ni un corte fijo de madrugada.
- Fechas visibles en `BUSINESS_CONFIG.timezone`, duración y plazo de cancelación leídos de las constantes compartidas.
- UUID y estados reales, sin códigos de confirmación inventados. Una reserva pasada conserva su estado real hasta que la etapa de asistencia lo cambie.
- Registro con nombre y apellido separados, teléfono opcional y validación de contraseña igual a la API.
- Se retiraron comentarios de reserva, promesas de email y tolerancia de llegada de 15 minutos: esas funciones no existen actualmente.
- No se publican horarios, direcciones alternativas, aforo máximo o metadatos de sucursal ficticios. La fotografía gastronómica es decorativa y común; no representa fotos verificadas de cada sucursal. Las fotos específicas podrán agregarse cuando exista un campo real para ellas.
- Se conservan los permisos del servidor: ocultar/deshabilitar una acción en la UI no reemplaza la autorización de la API.

## Sesiones y errores

Los tokens y el usuario se guardan en `sessionStorage` de la pestaña para restaurar sesión al recargar; las reservas se consultan al servidor y no se persisten como datos de demo. El cliente comprueba `/auth/me` al restaurar. Una renovación usa una única petición compartida entre llamadas concurrentes de esa pestaña. Logout espera una renovación en curso antes de revocar su refresh y, si no puede contactar al servidor, informa el error y conserva la sesión para reintentar.

La política ahora es de sesiones independientes por pestaña: Web Locks impide restaurar una copia de la sesión que ya está en uso en otra pestaña. La copia pide login sin revocar la original. Sin Web Locks, nuevos ingresos funcionan en memoria y requieren login tras recargar. También se rechazan respuestas autenticadas de un inicio de sesión anterior, sin reenvío bajo otra cuenta. Ver [SESIONES-WEB.md](SESIONES-WEB.md). Siguen pendientes cookies HttpOnly o justificación del almacenamiento actual, CSP y protección frente a XSS antes de producción. No se modificó la autenticación del backend para esta entrega.

No se repiten automáticamente POST de reserva por errores de red, servidor o cupo. Si la confirmación tiene resultado incierto se bloquea el reenvío en esa pantalla y se indica consultar Mis reservas. La API todavía no tiene idempotencia de creación: esa revisión evita un reintento ciego, pero no sustituye una garantía de idempotencia del servidor.

Los errores de negocio se muestran con el mensaje de la API; errores de conexión permiten reintentar consultas. Una cancelación fallida vuelve a consultar el estado antes de mostrar éxito.

## Pruebas

Verificado el 30 de octubre de 2026: build completo, chequeo de tipos, 21 pruebas de API/web (15 y 6), integración PostgreSQL de la API y dos recorridos Playwright aprobados — escritorio y móvil. Se revisaron las capturas y el cierre de los servidores temporales. No hay cambios en archivos de `apps/api` ni en las reglas de los paquetes compartidos.

```powershell
pnpm.cmd build
pnpm.cmd test
pnpm.cmd lint
pnpm.cmd --filter @repo/api test:integration
pnpm.cmd --filter @repo/web exec playwright install chromium
pnpm.cmd --filter @repo/web test:e2e
```

Las pruebas de web incluyen renovación concurrente, errores sin reenvío, logout fallido y fechas en la zona del restaurante. Las de navegador recorren sucursal → disponibilidad → registro → confirmación → recarga → detalle → cancelación → logout/login en escritorio y móvil, comprobando PostgreSQL y ausencia de desbordamiento horizontal.

Playwright inicia API y web locales si no están disponibles. Requiere PostgreSQL configurado y el build previo de la API. Crea exclusivamente una sucursal, mesa, excepción y usuario temporales propios; los elimina al terminar. No usar producción. Capturas y trazas quedan en `apps/web/test-results`, excluido de Git.

## Pendientes de la interfaz

- Agenda y gestión operativa para STAFF; administración global para ADMIN.
- Asistencia y fidelización cuando se implemente la etapa 5.
- Recuperación de contraseña y verificación de correo cuando existan sus endpoints.
- Idempotencia de creación o reconciliación más completa entre pestañas/recargas, y cierre de la revisión de almacenamiento para el lanzamiento. Las sesiones independientes por pestaña ya están protegidas.
- Fotografías y metadatos reales por sucursal, si se incorporan al contrato del producto.
- Validación de producción de proxy, rutas directas, HTTPS, CSP y privacidad.

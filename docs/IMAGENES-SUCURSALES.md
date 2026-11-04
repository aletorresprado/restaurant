# Imágenes propias de las sucursales

Implementado el 4 de noviembre de 2026, a partir de la prueba del propietario del panel de sucursales. Antes, todas las tarjetas del inicio mostraban la misma foto ilustrativa; ahora cada sucursal puede tener su propia imagen.

## Uso

1. Ingresar como ADMIN y abrir **Administración → Sucursales**.
2. En la tarjeta de una sucursal ya creada, usar **Elegir imagen**, seleccionar un JPG, PNG o WebP de hasta 2 MB y revisar la vista previa.
3. Pulsar **Guardar imagen**. La foto se muestra en la tarjeta del inicio y se conserva al recargar o reiniciar los servicios.
4. Para reemplazarla, elegir otro archivo y guardar. Para volver a la imagen general, usar **Quitar imagen → Confirmar quitar imagen**.

Las sucursales nuevas se crean primero y después reciben su imagen. La foto puede gestionarse y previsualizarse aunque la sucursal esté inactiva. Solo las activas exponen su imagen públicamente. No cambia la imagen grande de portada ni las ilustraciones de reservas; esta función se aplica a las tarjetas de sucursales del inicio.

No se solicita un servicio externo ni una cuenta adicional. Si una foto no está disponible, la tarjeta del inicio usa la imagen general como respaldo.

## Persistencia y API

La migración incremental `20261104000100_branch_images` agrega a `Branch` los campos `imageData` (BYTEA), `imageMime` e `imageVersion` (UUID). Una restricción mantiene los tres vacíos o completos y limita tamaño y tipos. Los bytes se guardan en PostgreSQL: no se necesitan rutas locales compartidas, carpetas de subidas ni archivos fuera de las copias de seguridad de la base.

La escritura actualiza imagen, tipo y versión juntos. Reemplazar sobrescribe la imagen anterior, sin dejar archivos huérfanos. Quitar es repetible y no afecta a la sucursal, sus reservas, horarios o personal. Si varios administradores reemplazan simultáneamente, prevalece la última escritura; no hay historial de versiones de fotos.

| Método y ruta, con prefijo `/api/v1` | Acceso |
| --- | --- |
| `GET /branches/:id/image` | Público; solo sucursal activa y con imagen, en otro caso 404. |
| `GET /admin/branches/:id/image` | ADMIN; vista previa incluso de una inactiva. |
| `POST /admin/branches/:id/image` | ADMIN; `multipart/form-data`, un campo de archivo llamado `file`. Sube o reemplaza. |
| `DELETE /admin/branches/:id/image` | ADMIN; quita la foto y devuelve `imageVersion: null`. |

Swagger documenta la carga con selector de archivo. Las lecturas devuelven el binario con el tipo de imagen y `X-Content-Type-Options: nosniff`, sin caché persistente. Catálogos y detalles incluyen solo `imageVersion`, nunca bytes ni tipo interno. La versión cambia al reemplazar y actualiza la URL del inicio para que no conserve una foto anterior. La vista previa de ADMIN descarga el binario con Bearer token; no coloca tokens en URLs.

## Límites

- Máximo 2 MiB (2097152 bytes). El servidor limita el multipart y comprueba firma inicial y tipo MIME de JPEG, PNG y WebP; no basta con renombrar una extensión. No admite SVG ni GIF. No se realiza una decodificación completa o reescritura del archivo en el backend.
- No hay compresión, redimensionado, eliminación de metadatos ni editor de recorte. Se conserva el original; la interfaz muestra `object-fit: cover` centrado en proporción 4:3. Conviene elegir una foto horizontal cuyo contenido principal esté centrado y evitar archivos con datos que no se quieran publicar.
- Elegir un archivo solo cambia la vista previa local hasta guardar. No hay almacenamiento de las fotos en sessionStorage ni en el repositorio.
- Las imágenes aumentan el tamaño de PostgreSQL y sus respaldos. Para un catálogo pequeño este almacenamiento simplifica la persistencia; antes de producción hay que revisar volumen, ancho de banda, política de retención y eventual optimización o almacenamiento de objetos/CDN según el hosting elegido. No se contrató ningún servicio.

## Actualizar otra instalación

Detener temporalmente la API si el motor Prisma está bloqueado en Windows y ejecutar desde la raíz:

```powershell
pnpm.cmd --filter @repo/api db:generate
pnpm.cmd --filter @repo/api db:deploy
pnpm.cmd build
pnpm.cmd dev
```

No resetear la base. Los registros existentes reciben campos nulos y conservan la imagen general. La migración se aplicó localmente sin modificar las fotos de sucursales reales; las pruebas crean y eliminan únicamente sus propias sucursales temporales.

## Validación

Compilación del monorepo, tipos, 17 pruebas de API y 8 de web. Se agregaron dos casos del cliente HTTP para límites multipart proporcionados por el navegador y lectura binaria después de renovar un token. Integración PostgreSQL ampliada: permisos CUSTOMER/STAFF/ADMIN, tamaño, MIME y contenido incompatibles, subida, reemplazo, borrado repetido, sucursal inactiva y exclusión de bytes del catálogo. El recorrido de sucursales en escritorio y móvil verifica selección, vista previa, imagen real en el inicio, recarga, reemplazo y borrado. Se mantienen los recorridos de cliente y gestión.

Comandos: `pnpm.cmd build`, `pnpm.cmd test`, `pnpm.cmd lint`, `pnpm.cmd --filter @repo/api test:integration`, `pnpm.cmd --filter @repo/web test:e2e` y `git diff --check`. No ejecutar pruebas de integración o navegador contra producción.

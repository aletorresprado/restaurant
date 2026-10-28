# Sucursales y permisos

Implementado el 28 de octubre de 2026. Todas las rutas llevan `/api/v1`.

## Alcance de cada rol

| Acción | Público / CUSTOMER | STAFF | ADMIN |
| --- | --- | --- | --- |
| Consultar sucursales activas públicas | Sí | Sí | Sí |
| Consultar sucursales en rutas de personal | No | Solo activas asignadas | Todas; listado solo activas |
| Consultar sucursales inactivas | No | No | Sí |
| Crear, editar o desactivar sucursales | No | No | Sí |
| Consultar o modificar asignaciones | No | No | Sí |
| Consultar usuarios o cambiar CUSTOMER/STAFF | No | No | Sí |

Los guards verifican identidad, estado activo y rol actual consultando PostgreSQL. El rol incluido en un JWT antiguo no concede permisos después de un cambio. Se responde 401 sin autenticación válida y 403 si falta el rol o la asignación. Las sucursales inactivas o inexistentes devuelven 404 en rutas públicas y de personal.

## Endpoints

| Método | Ruta | Acceso / comportamiento |
| --- | --- | --- |
| GET | `/branches` | Público, lista paginada de activas |
| GET | `/branches/:id` | Público, detalle de una activa |
| GET | `/admin/branches` | ADMIN, lista paginada incluyendo inactivas |
| GET | `/admin/branches/:id` | ADMIN, detalle incluyendo inactivas |
| POST | `/admin/branches` | ADMIN, crear |
| PATCH | `/admin/branches/:id` | ADMIN, editar o cambiar `isActive` |
| GET | `/admin/branches/:id/staff` | ADMIN, asignaciones con datos básicos del personal |
| PUT | `/admin/branches/:id/staff/:userId` | ADMIN, asignar STAFF activo; repetible sin duplicados |
| DELETE | `/admin/branches/:id/staff/:userId` | ADMIN, retirar asignación; no elimina al usuario |
| GET | `/staff/branches` | STAFF/ADMIN, lista paginada según alcance |
| GET | `/staff/branches/:id` | STAFF asignado o ADMIN |
| GET | `/admin/users` | ADMIN, usuarios paginados sin hashes ni sesiones |
| PATCH | `/admin/users/:id/role` | ADMIN, cuerpo `{ "role": "STAFF" }` o `{ "role": "CUSTOMER" }` |

Las listas paginadas aceptan `page` (1 por defecto, máximo 100000) y `limit` (20 por defecto, entre 1 y 100). Devuelven `data` y `meta` con `total`, `page`, `limit` y `totalPages`. La lista de asignaciones es un arreglo y no está paginada.

Los identificadores deben ser UUID. Los campos desconocidos o cuerpos vacíos en PATCH de sucursal se rechazan con 400. La creación valida los campos conocidos y descarta campos adicionales.

## Recorrido desde Swagger

1. Aplicar las migraciones, generar Prisma y compilar según el README. Si no hay un administrador, configurar sus datos y ejecutar `db:seed`.
2. Abrir `http://localhost:3000/api/docs` y ejecutar `POST /auth/login` con el administrador.
3. Copiar `accessToken` en el botón **Authorize**. Swagger agrega el prefijo Bearer automáticamente.
4. Ejecutar `POST /admin/branches` con:

```json
{
  "name": "Sucursal Centro",
  "address": "Calle Principal 123",
  "phone": "+54 381 1234567",
  "latitude": -26.824,
  "longitude": -65.222
}
```

5. Registrar la cuenta del empleado mediante `POST /auth/register`. El registro siempre crea CUSTOMER, incluso si se envía otro rol.
6. Con autorización del administrador, obtener el ID del usuario desde `GET /admin/users` y cambiar su rol a STAFF mediante `PATCH /admin/users/:id/role`.
7. Asignarlo mediante `PUT /admin/branches/:id/staff/:userId`.
8. Iniciar sesión como empleado, reemplazar la autorización en Swagger y consultar `GET /staff/branches`: verá sus sucursales activas asignadas.
9. Volver a autorizar al administrador para editar, desactivar o retirar asignaciones.

## Reglas y límites

- `name` requiere entre 2 y 100 caracteres y `address` entre 5 y 255, después de quitar espacios externos. Teléfono y coordenadas son opcionales.
- Al crear, latitud y longitud deben enviarse juntas. Si la sucursal aún no tiene coordenadas, su primera actualización también requiere ambas; después se permite corregir una sola. No se implementa todavía borrado de coordenadas mediante `null`.
- La latitud está entre -90 y 90 y la longitud entre -180 y 180.
- `isActive` es true por defecto. Desactivar no borra datos ni asignaciones. Al reactivar, el personal asignado recupera acceso.
- Solo se asignan usuarios activos con rol STAFF. ADMIN tiene acceso global y no necesita asignaciones. Al bajar un STAFF a CUSTOMER se eliminan sus asignaciones en la misma transacción.
- El endpoint de roles no acepta ADMIN ni permite modificar una cuenta que ya sea administradora. No hay todavía gestión general de perfiles, activación de usuarios o creación de administradores por HTTP.
- Las asignaciones se conservan si un usuario es desactivado por otro mecanismo, pero el guard impide su acceso mientras esté inactivo.
- No hay eliminación permanente de sucursales por HTTP, unicidad de nombres, búsqueda ni auditoría de cambios administrativos en esta etapa.
- Las rutas operativas están implementadas; ver [OPERACION.md](OPERACION.md) y [RESERVAS.md](RESERVAS.md). La desactivación de sucursal se rechaza si tiene reservas confirmadas que aún no terminaron.

## Validación

`pnpm.cmd --filter @repo/api test:integration` verifica con PostgreSQL real los roles, altas y cambios, asignación idempotente, aislamiento entre sucursales, retirada de acceso, desactivación y cambio de rol simultáneo con asignación. También conserva las comprobaciones de autenticación de la etapa anterior. Usa usuarios y sucursales aleatorios propios, y los elimina al finalizar; no usar una base de producción.

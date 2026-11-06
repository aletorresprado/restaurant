# Puntos y fidelización

Implementado el 3 de noviembre de 2026. No requiere cuentas ni servicios externos.

## Reglas

- Asistencia registrada: +1 punto. Ausencia registrada: −3, limitada al saldo disponible.
- Encuesta: +2, una vez por reserva propia ATTENDED y después de su hora de finalización. Calificación entera de 1 a 5; todas las calificaciones reciben la misma recompensa.
- El saldo mínimo es cero. Niveles según `packages/config`: WHITE 0, BRONZE 5, SILVER 10, GOLD 15, PLATINUM 31. El nivel puede bajar al descontar puntos.
- El saldo pertenece a la cuenta y se comparte entre sucursales. No hay vencimiento, canje ni beneficios monetarios definidos.

La asistencia/ausencia, el evento, el movimiento y el saldo se escriben en una sola transacción. El bloqueo del usuario coordina operaciones de distintas sucursales, encuestas y ajustes. Una clave única impide duplicar movimientos. Incluso una penalización aplicada en cero queda registrada con `requestedPoints: -3`, `points: 0` y `balanceAfter: 0`.

## Presentación de niveles en la web

Desde el 6 de noviembre de 2026, Mis puntos y Administración muestran una estrella rellena junto al nombre: White (blanca con contorno gris), Bronze (bronce), Silver (plateada), Gold (dorada) y Platinum (platino claro con matiz azulado). El texto permanece visible y el icono es decorativo para lectores de pantalla: el nivel no se comunica solo por color.

Mis puntos tiene un desplegable **Niveles de fidelización** que muestra los cinco niveles y sus umbrales, leídos de `LOYALTY_TIER_THRESHOLDS`. La presentación es compartida mediante `LoyaltyTierBadge`; los códigos de la API siguen siendo WHITE/BRONZE/SILVER/GOLD/PLATINUM. No se modifican los puntos ni la función que calcula el nivel. El recorrido de cliente comprueba nombres, iconos y colores diferenciados; el de administración comprueba el nivel resultante de un ajuste.

## Activación e historial anterior

La migración `20261103000100_loyalty` inicia todos los saldos en cero y no recalcula eventos anteriores. Repetir una asistencia/ausencia ya registrada devuelve el resultado existente sin generar puntos retroactivos. Se puede responder una encuesta de una reserva histórica propia con asistencia y ya finalizada, si todavía no tiene encuesta.

Si se decide reconocer asistencias históricas, un administrador debe realizar ajustes explícitos con motivo y clave de operación; no ejecutar importaciones automáticas ni volver a marcar asistencia. El primer resultado de asistencia sigue siendo definitivo; los ajustes corrigen puntos, no estados.

## API y permisos

Todos los endpoints requieren Bearer token. Los paths siguientes son relativos a `/api/v1`.

| Método y ruta | Uso |
| --- | --- |
| `GET /loyalty/me` | Saldo y nivel propios, para una cuenta autenticada. |
| `GET /loyalty/me/movements?page=1&limit=20` | Historial propio paginado. |
| `GET /loyalty/reservations/:id/survey` | Estado de encuesta de una reserva propia. Una reserva ajena devuelve 404. |
| `POST /loyalty/reservations/:id/survey` | CUSTOMER; cuerpo `{ "rating": 5 }`. |
| `GET /admin/users/:userId/loyalty` | ADMIN; saldo y nivel de una cuenta. |
| `GET /admin/users/:userId/loyalty/movements` | ADMIN; auditoría paginada. |
| `POST /admin/users/:userId/loyalty/adjustments` | ADMIN; ajuste con motivo obligatorio. |

Ejemplo de ajuste:

```json
{
  "operationId": "ad9278d0-455a-47db-8d75-403a23a0289b",
  "points": 5,
  "reason": "Reconocimiento documentado de visitas anteriores"
}
```

`points` es un entero distinto de cero entre −10000 y 10000; motivo de 3 a 500 caracteres. Cada ajuste nuevo usa otro UUID. Reintentar con el mismo usuario, UUID y contenido devuelve el movimiento original; cambiar el contenido devuelve 409. Una encuesta repetida con la misma calificación tampoco duplica puntos; cambiarla devuelve 409. No hay edición ni eliminación de movimientos por HTTP: una corrección usa otro ajuste auditado.

Cada movimiento conserva usuario, actor, clase, clave de origen, puntos solicitados/aplicados y saldo resultante. Los relacionados con una reserva conservan su UUID como referencia histórica, sin eliminación en cascada al retirar una sucursal. Eliminar la cuenta directamente de la base sí elimina sus movimientos; no existe endpoint de eliminación de cuentas y la política de retención productiva sigue pendiente.

## Interfaz y prueba manual

1. Reiniciar los servicios con `pnpm.cmd dev` después de aplicar la migración y generar Prisma.
2. Ingresar como cliente y abrir **Mis reservas**: muestra puntos, nivel e historial con paginación.
3. Registrar asistencia o ausencia con personal autorizado desde Swagger. Al volver a Mis reservas, se consulta el saldo real.
4. Abrir una reserva con asistencia y ya finalizada: responder la encuesta y verificar su recompensa. Recargar mantiene el estado respondido.
5. Con ADMIN, consultar movimientos y probar un ajuste desde Swagger. Repetir el mismo cuerpo conserva el mismo movimiento.

La [agenda y administración web](GESTION-WEB.md) permiten registrar asistencia, ausencia y ajustes de puntos con los roles correspondientes. No se automatiza NO_SHOW: una reserva pendiente no recibe penalización hasta que el personal lo registra.

## Verificación

Compilación y chequeo de tipos del monorepo; 17 pruebas de API y 6 de web. Integración PostgreSQL ampliada para recompensas, penalizaciones en cero, niveles, ajustes concurrentes, encuestas simultáneas, permisos, validación y reintentos. Los recorridos Playwright de escritorio y móvil incluyen encuesta, recarga, consulta de saldo e historial y comprobación de un único movimiento en PostgreSQL.

Comandos: `pnpm.cmd build`, `pnpm.cmd test`, `pnpm.cmd lint`, `pnpm.cmd --filter @repo/api test:integration`, `pnpm.cmd --filter @repo/web test:e2e`. Usar únicamente la base de desarrollo para pruebas de integración y navegador.

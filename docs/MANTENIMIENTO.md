# Mantenimiento de sesiones, enlaces y salud de PostgreSQL

Implementado el 13 de noviembre de 2026 para preparar la publicación web. No agrega dependencias ni migraciones: utiliza los índices de vencimiento existentes. No contrata servicios ni constituye un despliegue.

## Qué se limpia

La API ejecuta la limpieza al arrancar y luego cada 15 minutos. Borra exclusivamente registros de `Session` y `AccountActionToken` cuyo `expiresAt` ya venció al comenzar la ejecución. Una sesión o enlace vencido ya era rechazado por autenticación; borrar el registro libera espacio, sin cambiar su duración ni cerrar sesiones vigentes.

No borra usuarios, reservas, eventos, ajustes/puntos, imágenes, bloqueos operativos, registros de idempotencia ni archivos del buzón de correo. Sus políticas de conservación se definirán por separado. El navegador puede conservar una cookie de una sesión vencida; la API la rechaza y la eliminación del registro no necesita acceder al equipo del usuario.

Los timestamps de estas tablas se guardan como UTC sin zona en PostgreSQL mediante Prisma. La comparación SQL convierte el límite a UTC explícitamente, sin depender de la zona del servidor. Se verificó con una conexión configurada en Pacific/Auckland y vencimientos próximos, además de la zona local del desarrollo.

## Ejecución y límites

- Hasta 500 filas por tabla en cada transacción y 10 lotes por ejecución: por defecto, hasta 5000 sesiones y 5000 enlaces. Si queda trabajo, continúa en otra ejecución. La transacción de cada lote tiene espera de pool de hasta 2 segundos y plazo configurado de 5 segundos.
- Filas ordenadas por vencimiento e identificador y selección `FOR UPDATE SKIP LOCKED`. Se omiten las filas bloqueadas por otra operación; una ejecución posterior podrá retirarlas. Una transacción conserva juntos los borrados de ambas tablas de ese lote.
- No se superponen ejecuciones dentro del proceso. Las solicitudes internas simultáneas comparten la promesa en curso. Si hubiera varios procesos, los bloqueos de PostgreSQL coordinan las filas; eso no habilita por sí solo varias instancias, porque los límites de acceso actuales siguen en memoria.
- Al detener la API se cancela el intervalo, se espera el lote en curso y no se inician otros. Prisma se desconecta después de destruir los servicios, para permitir ese cierre. Los temporizadores no mantienen por sí solos abierto el proceso.
- Los lotes ya confirmados se conservan si otro falla; se escribe un aviso genérico y la próxima ejecución vuelve a intentarlo. No se registra el error SQL ni los datos de conexión.

Configuración opcional en `apps/api/.env`; los valores predeterminados ya funcionan:

```dotenv
MAINTENANCE_ENABLED=true
MAINTENANCE_INTERVAL_SECONDS=900
MAINTENANCE_BATCH_SIZE=500
```

`MAINTENANCE_ENABLED` acepta `true` o `false`; el intervalo admite 60–86400 segundos y el lote 10–1000 filas. Cambiar variables requiere reiniciar la API. `false` deshabilita la programación, útil en pruebas aisladas; no hace válidas sesiones o enlaces vencidos. No hay endpoint público para disparar borrados.

El temporizador necesita una API en ejecución. Si el hosting suspende el proceso o usa funciones efímeras, no garantiza la frecuencia configurada: habrá que usar un plan/proceso continuo o un programador externo. Al volver a arrancar intenta limpiar el atraso respetando el mismo presupuesto por ejecución.

En la terminal se observa, por ejemplo:

```text
cleanup completed sessions=0 links=0 batches=1 capped=false
```

Son cantidades agregadas, sin correo, usuario, token ni contraseña. `capped=true` indica que se alcanzaron diez lotes; no garantiza que queden registros. `cleanup failed; next scheduled run will retry` informa un fallo sin exponer detalles internos. No hay todavía almacenamiento centralizado, rotación, métricas ni alertas de estos logs; se configurarán con el hosting.

## Salud del proceso y de la base

| Ruta GET | Qué comprueba | Resultado |
| --- | --- | --- |
| `/api/v1/health` | El proceso HTTP responde, sin consultar la base | 200 con el contrato anterior |
| `/api/v1/health/ready` | Ejecuta `SELECT 1` usando la conexión Prisma | 200 si responde; 503 ante error o espera agotada |

Respuesta correcta de readiness:

```json
{"status":"ok","service":"App Resto API","checks":{"database":"up"}}
```

Ante un fallo cambia a `status: error`, `database: down` y HTTP 503. No muestra host, SQL, credenciales, stack ni el texto del error. Conserva los encabezados de seguridad y `Cache-Control: no-store` de la API.

La comprobación tiene una espera HTTP de 2 segundos y una caché interna de 1 segundo. Peticiones simultáneas comparten la consulta. Si una consulta sigue pendiente después del plazo, no se crean otras hasta que termine; el plazo HTTP no cancela físicamente esa consulta del driver. En producción deben configurarse también límites de conexión/pool y supervisión del servicio. Después de recuperarse la base se vuelve a informar su estado, con hasta un segundo de caché.

Readiness es una consulta de conectividad, no certifica migraciones, acceso a todas las tablas, capacidad, correo SMTP ni funcionamiento completo del restaurante. No reinicia PostgreSQL ni corrige fallos. La API conserva su comportamiento de exigir conexión al iniciar: si la base ya está caída durante el arranque, Prisma puede impedir que el proceso llegue a escuchar HTTP; el hosting deberá detectar y reiniciar ese proceso según su política.

`/health` permanece exceptuado de las cuotas. `/health/ready` usa la cuota normal de lecturas: 300/minuto por IP por defecto, compartida con otras consultas. El futuro monitor debe usar un intervalo moderado, por ejemplo 10 segundos; no consultar en un bucle continuo ni usar 429 como diagnóstico de caída de PostgreSQL.

## Cómo probar localmente

1. Iniciar `pnpm.cmd dev` desde la raíz y dejar la terminal abierta.
2. Abrir `http://127.0.0.1:3000/api/v1/health`: debe responder `status: ok`.
3. Abrir `http://127.0.0.1:3000/api/v1/health/ready`: debe mostrar `checks.database: up` con PostgreSQL disponible.
4. En Swagger (`http://127.0.0.1:3000/api/docs`), buscar **health**, abrir el GET de `/health/ready`, pulsar **Try it out → Execute**. No requiere login ni Bearer.
5. Observar la línea de limpieza en la terminal al iniciar y después del intervalo. Cero filas eliminadas es un resultado correcto si no hay vencidos.

No hace falta cambiar la fecha del equipo, insertar vencidos en cuentas reales ni detener PostgreSQL para probar. Las pruebas automáticas simulan fallos/esperas para HTTP 503 y prueban los borrados reales en tablas temporales de una conexión PostgreSQL, sin retirar datos de la aplicación.

## Comprobaciones y límites pendientes

Pruebas unitarias/HTTP: programación, apagado, lotes acotados, ejecuciones compartidas, reintento tras fallo, logs genéricos, caché y consulta pendiente, timeout/recuperación y separación de liveness/readiness. La integración usa tablas temporales con la estructura real; verifica expirados eliminados, vigentes conservados, idempotencia, presupuesto por ejecución y UTC en otra zona. También comprueba readiness con PostgreSQL disponible. No se interrumpe la base real para simular una caída.

Resultado del 13 de noviembre: compilación del monorepo, tipos, 81 pruebas (48 API + 33 web) e integración PostgreSQL completa aprobados. Una primera aserción detectó el desfase de zona horaria de los parámetros SQL; se corrigió la conversión UTC y se repitieron la integración y las pruebas de mantenimiento correctamente. La suite de navegador anterior no se repitió porque este cambio no modifica la interfaz. No hay validación bajo carga ni monitor de hosting configurado.

Referencias: [PostgreSQL SELECT y SKIP LOCKED](https://www.postgresql.org/docs/16/sql-select.html), [temporizadores Node.js](https://nodejs.org/docs/latest-v22.x/api/timers.html#timeoutunref).

Continúan pendientes la conservación del resto de los datos y archivos de correo, cola persistente y entrega SMTP, logs centralizados/alertas, CI con base aislada y pruebas de carga/despliegue. El alcance de presentación es la publicación web para la tesis; Google Play y App Store no forman parte de esta entrega.

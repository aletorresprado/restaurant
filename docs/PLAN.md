# Plan de desarrollo de App Resto

Actualizado: 13 de noviembre de 2026.

## Objetivo

Construir un sistema de reservas y fidelización para un restaurante con varias sucursales, con una API persistente y una interfaz para clientes y personal.

Alcance de cierre acordado con el propietario: publicar la aplicación **web** en un hosting elegido y contratado de común acuerdo, dejarla funcionando y preparar documentación/demostración para su proyecto final de la maestría en desarrollo con IA. Se documentará la interacción Lovable–Codex–GitHub y las decisiones/validaciones. Google Play y App Store quedan fuera de esta entrega; PWA/móvil se evaluarán después si se solicitan.

## Estado y recorrido restante

Las etapas 1 a 6 están implementadas y verificadas en desarrollo local: persistencia, permisos, operación, reservas, fidelización e interfaz de clientes/personal. Incluyen cookies HttpOnly, reintentos de reservas y altas de gestión, y ajustes de puntos compartidos entre pestañas. La etapa 7 está en curso: límites por IP implementados para una instancia; siguen encabezados/HTTPS real, entrega de correo, supervisión/retención, CI, respaldos y despliegue. La limpieza de sesiones/enlaces y readiness PostgreSQL están implementadas. Recuperación/verificación ya implementadas con buzón local y adaptador SMTP. No hay producción publicada.

La [hoja de ruta a producción](PRODUCCION.md) desglosa esos pendientes, las decisiones del propietario y los criterios para publicar. Tener el código subido a GitHub o Swagger accesible localmente no completa la etapa de despliegue.

## Método de trabajo

1. Tomar la primera etapa pendiente y revisar sus dependencias.
2. Implementar el flujo completo de esa etapa, incluyendo validación, permisos y persistencia.
3. Ejecutar las comprobaciones apropiadas y documentar qué se verificó y qué quedó pendiente.
4. Actualizar siempre `README.md` y el estado de este plan según los cambios reales.
5. Revisar el diff y comprobar que no haya secretos antes del commit y el push.

No marcar una etapa como terminada solo por tener tipos, dependencias o esquemas de validación. Deben existir endpoints y comportamiento verificado. Las decisiones todavía abiertas se resuelven al iniciar su etapa, antes de depender de ellas.

## 1. Persistencia y autenticación — completada

- [x] PostgreSQL con usuario de aplicación sin privilegios de administración.
- [x] Modelos Prisma de usuarios y sesiones, y migración inicial versionada.
- [x] Registro público de clientes, login y perfil autenticado.
- [x] Contraseñas con hash; refresh tokens aleatorios almacenados como hash.
- [x] Renovación de sesión de un solo uso y logout.
- [x] Comando explícito para crear un administrador inicial.
- [x] Validación de configuración y documentación Swagger.
- [x] Pruebas automatizadas con datos simulados y prueba de integración contra PostgreSQL real.

Validado: compilación, chequeo de tipos, esquema Prisma, 11 pruebas automatizadas y prueba real de registro, login, perfil, persistencia, rotación concurrente, logout y rechazo de usuarios desactivados. PostgreSQL local y Swagger accesibles en el equipo de desarrollo.

Límites actuales: entrega SMTP real, retención de otros datos y cierre global explícito pendientes. Ya hay limpieza de sesiones/enlaces vencidos. La etapa 7 implementa recuperación/verificación local y revoca también JWT al restablecer contraseña. Los límites por IP se implementaron en la etapa 7. El administrador inicial no se crea automáticamente.

## 2. Permisos y sucursales — completada

- [x] Autorización para `CUSTOMER`, `STAFF` y `ADMIN`, usando el rol actual de la base.
- [x] Personal limitado a sus sucursales activas asignadas; administrador con alcance global.
- [x] Modelos `Branch` y `BranchStaff`, con migración incremental aplicada localmente.
- [x] Consulta pública de sucursales activas y administración de altas, cambios y desactivación.
- [x] Asignación y retiro de personal, consulta administrativa de usuarios y cambio CUSTOMER/STAFF.
- [x] Rutas protegidas, validación de coordenadas y documentación Swagger.
- [x] Pruebas contra PostgreSQL de permisos, persistencia, aislamiento y cambios de rol con tokens existentes.

Decisiones: desactivar conserva asignaciones; bajar a CUSTOMER las elimina. No se crean ni modifican administradores desde la API de roles. La asignación y el cambio de rol bloquean la fila del usuario para coordinar solicitudes concurrentes. La consulta pública no requiere login y no expone personal. Ver [SUCURSALES.md](SUCURSALES.md).

Validación: compilación, 11 pruebas existentes, chequeo de tipos, esquema Prisma e integración real ampliada. Las pruebas de integración crean y eliminan exclusivamente sus usuarios y sucursales temporales.

Criterio de cierre: un administrador gestiona sucursales; un cliente consulta las disponibles y recibe un rechazo al intentar modificarlas. Pruebas de permisos y persistencia aprobadas.

## 3. Mesas, horarios y bloqueos — completada

- [x] Mesas por sucursal, capacidad 1–50, número inmutable único y estados operativos.
- [x] Horario semanal por día ISO, excepciones por fecha y bloqueos temporales.
- [x] Zona del restaurante para fechas de servicio y ventanas UTC, incluido cruce de medianoche.
- [x] Permisos por sucursal para ADMIN y STAFF asignado; rechazo de IDs de otra sucursal.
- [x] Validación de estado final en PATCH y solapamientos semanales, excepciones y bloqueos.
- [x] Migración aplicada, restricciones de integridad y transacciones para solicitudes concurrentes.
- [x] Compilación, 13 pruebas, chequeo de tipos, esquema Prisma e integración real ampliada.

Decisiones: un servicio por día de semana; la fecha identifica el inicio del servicio. Una excepción reemplaza ese servicio y no recorta el del día anterior. Intervalos semiabiertos permiten extremos contiguos. No hay eliminación de mesas por HTTP: se usa OUT_OF_SERVICE. Detalles y límites en [OPERACION.md](OPERACION.md).

Criterio de cierre: el personal autorizado configura capacidad y horarios; la API rechaza intervalos inválidos y operaciones fuera de su alcance. Migraciones y pruebas aprobadas.

## 4. Disponibilidad y reservas — completada

- [x] Duración de 120 minutos, grupos 1–50 y una mesa por reserva, asignación por capacidad suficiente más pequeña.
- [x] Disponibilidad pública por fecha de servicio, horarios, excepciones, capacidad, estado, bloqueos y reservas confirmadas.
- [x] Confirmación transaccional y coordinación con cambios operativos mediante bloqueo por sucursal.
- [x] Reservas propias, detalle e historial; agenda y detalle para personal autorizado.
- [x] Cancelación del cliente con al menos 6 horas y del restaurante antes del inicio, con actor y motivo cuando corresponde.
- [x] Protección de reservas frente a bloqueos y cambios de capacidad, estado, horario o desactivación.
- [x] Migración aplicada, compilación, 15 pruebas, tipos, esquema e integración PostgreSQL con concurrencia.

Decisiones: no se combinan mesas ni se permite elegir una mesa concreta desde el cliente. La consulta no retiene cupo. Cancelar libera la mesa; repetir la misma cancelación no duplica eventos. No hay reprogramación, reservas por cuenta de terceros ni notificaciones. Detalles en [RESERVAS.md](RESERVAS.md).

Criterio de cierre: un cliente completa una reserva real y puede consultarla o cancelarla según la política. Dos solicitudes simultáneas no pueden reservar la misma mesa en intervalos superpuestos. Cubrir horarios límite y zona horaria.

## 5. Asistencia y fidelización — completada

- [x] Asistencia desde el inicio y ausencia después de la tolerancia configurada, mediante endpoint de personal autorizado.
- [x] Eventos con actor y motivo opcional, idempotencia y rechazo de resultados opuestos concurrentes.
- [x] Preservar ocupación hasta el fin de una reserva ATTENDED; liberar mesa ante NO_SHOW.
- [x] Pruebas de tiempos, permisos y concurrencia contra PostgreSQL. Sin migración nueva: estados y eventos ya existían.
- [x] Persistir transacciones de puntos con trazabilidad y aplicación única por evento.
- [x] Calcular saldo y nivel usando las reglas compartidas, sin saldo negativo.
- [x] Implementar ajustes administrativos con motivo, autor y UUID de operación para reintentos.
- [x] Encuesta de calificación 1–5, propia, una vez por reserva con asistencia y finalizada; recompensa +2.
- [x] Activación sin recalcular asistencias/ausencias históricas; reconocimiento anterior mediante ajustes explícitos.
- [x] Quinta migración aplicada e integración real de puntos, niveles, encuestas y ajustes con concurrencia.

Decisiones: asistencia manual desde la agenda web o Swagger; no se admite corregir un resultado terminal ni registrar asistencia anticipada. Puntos +1/+2/−3 con mínimo cero y nivel calculado según saldo actual. No hay canjes ni vencimiento. Ver [ASISTENCIA.md](ASISTENCIA.md) y [FIDELIZACION.md](FIDELIZACION.md). Correcciones de estados y automatización de ausencias quedan como mejoras separadas; los ajustes administrativos corrigen puntos.

Criterio de cierre: los eventos generan los puntos esperados una sola vez, incluso con reintentos; el cliente consulta su saldo e historial y el administrador puede auditar ajustes.

## 6. Interfaz de clientes y personal — completada en desarrollo local

- [x] Web adaptable en `apps/web`, basada en el diseño de Lovable y conectada a nuestra API.
- [x] Registro/login, restauración y renovación de sesión y logout para la integración local.
- [x] Sucursales reales, fecha de servicio, grupo, disponibilidad y confirmación sin cambiar reglas de negocio.
- [x] Reservas propias, detalle, eventos y cancelación, con carga, errores y estados vacíos.
- [x] Pruebas de cliente HTTP y recorrido de navegador en escritorio y móvil contra PostgreSQL.
- [x] Sesiones web con cookies HttpOnly, revocación inmediata por pestaña, CSRF/origen y minimización de confirmaciones resueltas. La recuperación de reservas conserva únicamente los intentos pendientes.
- [x] Recuperación de altas de sucursales, mesas, horarios, excepciones y bloqueos con UUID transaccional; panel de pendientes y borradores/ajustes de puntos compartidos entre pestañas, con autor inmutable y limpieza de resultados resueltos.
- [x] Sesiones independientes por pestaña y detección de copias mediante Web Locks; aislamiento de respuestas, renovación y logout al cambiar de login. Sin Web Locks, ingreso en memoria sin restauración tras recargar. Los límites de privacidad y los controles de despliegue quedan documentados para la etapa 7.
- [x] Consulta de asistencia en detalle, saldo/nivel/historial en Mis reservas y encuesta tras una visita finalizada.
- [x] Agenda de sucursales autorizadas, asistencia, ausencia, cancelación e historial desde la web.
- [x] Administración de usuarios CUSTOMER/STAFF, asignaciones y fidelización con ajustes auditados y recuperación segura compartida entre pestañas.
- [x] Formularios de alta/edición/activación/desactivación de sucursales, con validaciones compartidas, conflictos por reservas vigentes y tratamiento de altas con respuesta incierta.
- [x] Imagen propia por sucursal: selección, vista previa, carga/reemplazo/borrado ADMIN, persistencia PostgreSQL y tarjetas del inicio con respaldo general.
- [x] Gestión web de mesas por sucursal autorizada: listado paginado, alta, capacidad, estados, confirmación y errores por reservas vigentes.
- [x] Horarios semanales y excepciones desde la web: altas, edición, cierres/desactivación/eliminación con confirmación, servicio por fecha y conflictos de la API.
- [x] Bloqueos temporales por mesa: inicio/fin en zona del restaurante, motivo, revisión/confirmación, consulta paginada, retirada y conflictos de la API.
- [x] Niveles con estrella de color y nombre, y leyenda de umbrales compartidos en Mis puntos; no cambia la lógica de puntos.
- [x] Confirmación de reservas con UUID persistente por operación, recuperación manual tras cortes/recargas y registro compartido por cuenta entre pestañas; API con índice único y transacción para evitar duplicados del mismo intento.

Decisiones: SPA React/Vite con TanStack Router, sin servicios Lovable ni un segundo backend. Se conserva el estilo visual y se conectan las funciones reales de la API. Ver [FRONTEND.md](FRONTEND.md) para procedencia y [GESTION-WEB.md](GESTION-WEB.md) para gestión. La configuración operativa y su recuperación están completas y probadas en desarrollo; quedan los controles de publicación de la etapa 7.

Criterio de cierre: los recorridos principales funcionan desde la interfaz contra la API real, con estados de carga, errores, acceso por rol y uso en pantallas pequeñas.

## 7. Preparación del primer despliegue — en curso

1. Límites por IP/correo y CSP de web/API/Swagger implementados localmente. Aplicar encabezados de la SPA y validar CORS, proxies y HTTPS en el hosting real. Incorporar contadores compartidos antes de usar varias instancias.
2. Recuperación/verificación y cola cifrada con reintentos implementadas localmente. Acordar proveedor/costo, configurar SMTP, remitente, clave privada de cola y supervisión; verificar entrega real antes de publicar.
3. Limpieza de sesiones/enlaces vencidos y readiness PostgreSQL implementadas. Completar retención del resto de datos, logs centralizados y alertas.
4. CI implementada y verificada en GitHub/Ubuntu, con PostgreSQL aislado, migraciones, build/tipos, pruebas e integración y 32 recorridos de navegador. Evidencia en CI.md; no es un despliegue.
5. Elegir hosting, presupuesto, secretos, copias de seguridad y procedimiento de restauración.
6. Validar migraciones y recorridos completos en un entorno de prueba antes de publicar.

Criterio de cierre: despliegue reproducible con configuración separada, respaldo y restauración comprobados, permisos verificados y monitoreo básico. La elección de cuentas o servicios pagos se confirma con el propietario antes de contratar.

Seguir la lista detallada de [PRODUCCION.md](PRODUCCION.md), que incluye seguridad de autenticación, reconciliación de reintentos de reserva, CI, entorno de prueba, migraciones, restauración y validación del primer lanzamiento. Los controles de publicación todavía no están completos.

## Punto de reanudación — actualizado el 13 de noviembre de 2026

Las etapas 1–6 están completas en desarrollo local. Las entregas anteriores incorporaron cookies HttpOnly, recuperación de reservas y altas de gestión con UUID, panel de pendientes y borradores/ajustes de puntos compartidos entre pestañas. Hay doce migraciones aplicadas localmente; no se publicaron servicios en producción. Referencias: [SESIONES-WEB.md](SESIONES-WEB.md), [RECUPERACION-RESERVAS.md](RECUPERACION-RESERVAS.md) y [RECUPERACION-GESTION.md](RECUPERACION-GESTION.md).

Aceptación manual del propietario: un borrador de +2 puntos se mostró en dos pestañas y **Volver a editar** lo retiró de ambas, dejando los campos disponibles. No se confirmó un movimiento en ese recorrido.

Entrega del 12 de noviembre: límites por IP y grupo antes de los controladores, compartidos entre web/Swagger, con respuesta 429 y tiempo de espera. Login 30/15 min, registro 10/hora, renovación 60/min, modificaciones 120/min y consultas 300/min. Logout, OPTIONS y salud exceptuados. La web conserva la sesión y el UUID pendiente; no reenvía automáticamente. Configuración validada y confianza en proxies solamente por IP explícita. No hay cambios en reglas de reservas, puntos o permisos, ni nuevas migraciones, dependencias o cuentas. Ver [LIMITES-API.md](LIMITES-API.md).

Alcance: contadores acotados en memoria de un proceso; se borran al reiniciar. Antes de desplegar varias instancias se necesita un contador compartido. IPs compartidas comparten cuotas; ataques distribuidos y volumen total requieren controles de infraestructura. Esta entrega no completa la etapa 7.

Validación de límites: compilación del monorepo, tipos, 58 pruebas unitarias/HTTP (27 API + 31 web) e integración PostgreSQL. Se comprueban ventanas, grupos, concurrencia HTTP, rechazo antes del controlador, proxies/configuración, sesión conservada y reintento con el mismo UUID tras 429. La integración funcional usa límites altos explícitos en su servidor temporal para no consumir las cuotas normales con sus fixtures. Los veinte recorridos generales de navegador de la entrega anterior siguen como antecedente. No hay prueba de carga ni despliegue real.

Entrega posterior de CSP: build con política en meta, encabezados HTTP de desarrollo/preview y archivo de valores para el futuro hosting. API restrictiva y Swagger con scripts locales, sin validador externo ni persistencia de autorización. Las únicas excepciones de scripts inline se limitan a Vite de desarrollo; el build no las admite. Se conservan las fuentes y las imágenes. No cambia la lógica ni el esquema de base. Ver [CSP.md](CSP.md).

Validación de CSP: build, tipos, 61 pruebas (28 API + 33 web) e integración PostgreSQL correctos. La suite aislada `test:security` aprobó sus ocho recorridos en 44,4 segundos: bloqueo efectivo de código inline y conexiones externas, Swagger, desarrollo y recorridos de clientes/sucursales en el build de escritorio/móvil. Las primeras ejecuciones tuvieron esperas agotadas en transiciones y una desconexión de PostgreSQL; no se observaron violaciones CSP en esas transiciones. Se ajustó la espera de aserciones de esta suite a los 15 segundos de las peticiones y la última ejecución aprobó completa. Conservar estas incidencias como límite de validación del entorno local. La primera corrida en sandbox necesitó cerrar sus árboles temporales de servidores para terminar; la última, fuera del sandbox, cerró normalmente.

Entrega de fallos por cuenta: cinco credenciales rechazadas al mismo correo normalizado en una ventana fija de 15 minutos provocan una pausa de 60 segundos. Web/Bearer comparten el contador aunque cambie la IP. El quinto fallo responde 401; durante la pausa se responde 429 con espera sin emitir sesiones ni prolongar la pausa por rechazos. Un ingreso correcto limpia los fallos; la pausa vencida inicia una nueva ventana. Se admite una sola comprobación de contraseña a la vez por correo (las simultáneas reciben 429/1 segundo). Se mantiene la misma política para correos inexistentes y usuarios inactivos; errores de infraestructura no consumen fallos. No cambia el estado de la cuenta ni las sesiones ya abiertas. Sin nuevas migraciones/dependencias. Configuración y límites en [LIMITES-API.md](LIMITES-API.md).

Validación de cuenta: build, tipos, 68 pruebas unitarias/HTTP (35 API + 33 web), integración PostgreSQL con usuarios temporales y diez recorridos de seguridad aprobados en 50,4 segundos. Se verifica ventana, reinicio por éxito, pausa sin prórroga, concurrencia, errores de infraestructura, memoria acotada, correos conocidos/desconocidos, contratos web/Bearer y mensaje en móvil/escritorio. La cuota IP de las suites de integración es alta para sus fixtures; el control de fallos por cuenta mantiene 5/60 segundos. Persisten mensajes de imágenes `StreamableFile: Premature close` al interrumpirse cargas durante navegación, sin fallos en los recorridos. No se repitieron los veinte recorridos generales ni se hicieron pruebas de carga. Contadores en memoria de un proceso: una campaña persistente puede producir pausas repetidas y varias instancias requieren almacén compartido; no es una certificación de seguridad ni un despliegue.

Entrega de correo: décima migración `20261112000100_account_actions`, enlaces por propósito con hash/TTL y consumo único, verificación de correo y recuperación pública con pantallas web. El alta solicita verificación en segundo plano; no verificar todavía no impide operar. Buzón local privado ignorado por Git y bloqueado en Vite, con adaptador SMTP TLS para un futuro proveedor. No hay entrega SMTP real configurada ni cola persistente. Restablecer incrementa authVersion, revoca cookies/refresh/JWT y limpia enlaces, coordinando con login/refresh mediante bloqueo por usuario. No cambia roles, reservas ni puntos. Ver [CORREO-CUENTAS.md](CORREO-CUENTAS.md).

Validación de correo: build, tipos, esquema Prisma, 72 pruebas unitarias/HTTP (39 API + 33 web), integración PostgreSQL ampliada y doce recorridos de seguridad en escritorio/móvil. Se comprobaron hash, propósito, TTL, enfriamiento por destinatario, confirmación explícita, uso concurrente único y revocación aun compitiendo con un login/refresh. Prueba PostgreSQL del restablecimiento local aprobada. La instalación de Nodemailer requirió usar los certificados de Windows con `NODE_OPTIONS=--use-system-ca`, manteniendo TLS; no se desactivó validación de certificados. Una aserción HTTP excedió 5 segundos al compartir CPU con build/navegador; se ajustó su plazo a 15 segundos y se repitió correctamente. Las pruebas de SMTP usan un doble y no verifican entrega real. No se ejecutó la suite general completa ni prueba de carga; la cola y la configuración del proveedor siguen como condiciones de publicación.

Aceptación del propietario del 12 de noviembre: confirmó que pudo completar desde la web la recuperación de contraseña y la verificación de correo con el buzón local, siguiendo el procedimiento de [CORREO-CUENTAS.md](CORREO-CUENTAS.md). La entrega queda validada manualmente para desarrollo; no hay proveedor SMTP real ni producción publicada.

Entrega del 13 de noviembre: mantenimiento automático de sesiones/enlaces vencidos al iniciar y cada 15 minutos, en lotes de 500 por tabla hasta 10 lotes por ejecución. Selección con bloqueo y SKIP LOCKED, sin superposición local y cierre ordenado antes de desconectar Prisma. Solo borra credenciales vencidas; conserva usuarios, reservas, puntos, archivos de correo y registros de idempotencia. Readiness `/api/v1/health/ready` consulta PostgreSQL y devuelve 200/503, caché de un segundo y plazo HTTP de dos segundos; liveness mantiene `/health`. Logs del mantenimiento con cantidades o aviso genérico, sin secretos. Sin dependencias ni migraciones nuevas. Ver [MANTENIMIENTO.md](MANTENIMIENTO.md).

Validación del mantenimiento: build, tipos, 81 pruebas (48 API + 33 web) e integración PostgreSQL completa. Los borrados se prueban en tablas temporales por conexión con la estructura real, sin tocar registros de la aplicación; vigentes conservados, idempotencia y presupuesto por ejecución. La primera prueba detectó un desfase al castear timestamps en la zona del servidor: corregido con UTC explícito y verificado en Pacific/Auckland con vencimientos próximos. Se prueban timeout, recuperación y 503 genérico mediante dobles, y readiness con PostgreSQL disponible. No se detuvo la base real ni se repitió Playwright: la interfaz no cambia. Continúan pendientes monitor/alertas, retención de otros datos/archivos, cola SMTP, CI, respaldos y despliegue para la presentación web de tesis.

Entrega de CI del 13 de noviembre: workflow GitHub Actions con acciones fijadas por SHA, permisos de lectura y PostgreSQL 16 efímero. Usuario de aplicación sin privilegios de superusuario/creación de bases/roles; guardas de host/nombre para impedir usar desarrollo/producción en modo CI. Node 22.19.0 y pnpm 9.15.4, instalación con lockfile, generación Prisma, migraciones, build/tipos, pruebas e integración y suites de navegador. Configuración sin despliegue ni secretos reales/SMTP. Los tests y Nest no cargan el `.env` local en modo CI. Ver [CI.md](CI.md).

Validación local de CI: actionlint 1.7.12 aprobó el workflow; tres pruebas de guardas, permisos reales, diez migraciones desde cero y segunda aplicación sin pendientes aprobados. Build, tipos, 81 pruebas API/web, integración y prueba PostgreSQL del operador aprobados sobre base nueva aislada. Primera corrida general: 19/20 recorridos aprobados; bloqueos móvil falló por timeout de transacción de ingreso. Segunda: 18/20, con fallos en bloqueos por espera/timeout; repetición aislada aprobó móvil y falló escritorio en ingreso. No se estableció una causa definitiva ni se modificaron timeouts de producción o reintentos para ocultarlo. En esa instancia faltaba la ejecución remota; quedó verificada en el cierre de CI documentado a continuación. Las bases temporales se eliminan al terminar cada intento; no se usa la base de desarrollo como destino de pruebas CI.

Cierre de validación local: se corrigió el helper de ingreso de bloqueos, que esperaba solo la respuesta HTTP; ahora confirma su éxito, espera la sesión visible y la redirección antes de continuar. La última corrida general aprobó 20/20 en 2,8 minutos. La suite independiente de seguridad aprobó 12/12 en 59,7 segundos. No se tocaron timeouts de producción ni se agregaron reintentos automáticos. Se retiraron todas las bases creadas para esos intentos. La incidencia y los resultados anteriores se conservan como antecedente; CI remota se verificó posteriormente con éxito; evidencia en el cierre remoto siguiente.

Cierre remoto de CI del 13 de noviembre: commit/push inicial `c8545f1`; la primera corrida falló en instalar pnpm por un BOM UTF-8 del JSON raíz. Corrección `ab7b4bf`: normalización de package/turbo JSON y prueba de regresión; [CI 43459544441](https://github.com/aletorresprado/restaurant/actions/runs/43459544441) aprobada completa en Ubuntu, con cuatro guardas, 81 pruebas API/web, integración, prueba del operador y 20+12 recorridos de navegador. Todos los pasos de cierre y retiro de contenedores también aprobaron. El incremento de CI queda verificado remotamente; la etapa 7 sigue abierta por correo real/cola, supervisión, infraestructura, respaldo y despliegue web.

Para continuar:

Entrega de cola del 25 de noviembre: migraciones once y doce `20261125000100_mail_queue` y `20261125000200_mail_queue_scope`, cifrado autenticado de destinatario/cuerpo e inserción transaccional con registro/token/reset. Trabajador dentro de la API, reclamos atómicos con SKIP LOCKED, reserva de 120 segundos, cinco intentos y esperas 30/120/600/1800 segundos. Descarta enlaces inválidos, limpia contenido terminal y conserva metadatos siete días. Producción exige clave independiente estable. Sin proveedor nuevo ni mensajes reales; falta supervisión externa. Puede entregar correos repetidos si se pierde una confirmación. Ver [COLA-CORREO.md](COLA-CORREO.md).

Validación de la cola: build, tipos, esquema Prisma, doce migraciones aplicadas y estado sin pendientes; 59 pruebas API + 33 web y cuatro guardas aprobados. Integración PostgreSQL completa aprobada, incluyendo rollback del token si falla encolar, contenido terminal borrado, reintento desde instancia nueva y SQL de cola sobre tablas temporales. Última suite de seguridad: 12/12 aprobados en 1,1 minutos, escritorio/móvil. La ejecución remota posterior [CI 45640945652](https://github.com/aletorresprado/restaurant/actions/runs/45640945652), commit `9636eaa`, aprobó todo, incluidos veinte recorridos generales y doce de seguridad. Commit/push completados; carga y SMTP real siguen pendientes.

Incidencias de validación: las copias temporales requirieron acceso SQL propio porque los delegates de Prisma califican tablas públicas; parámetros de fechas con UTC explícito. Se separaron scopes para impedir que servidores de prueba con buzones distintos tomaran trabajos ajenos. Una corrida de navegador mostró doce casos aprobados pero quedó detenida al cerrar procesos dentro del aislamiento de Windows; se interrumpió y se repitió fuera de ese aislamiento. Una corrida posterior aprobó 10/12 y falló en ingresar antes de pedir correo; otra integración concurrente agotó su espera. No se estableció una causa definitiva de esas demoras. Repetidas por separado, la integración completa y la suite de navegador aprobaron; no se modificaron timeouts ni se agregaron reintentos de pruebas. Se observaron avisos StreamableFile de cierre prematuro durante navegación, sin fallos en las aserciones finales. No constituye una prueba de carga ni de reinicio físico de PostgreSQL.

Avance del 25 de noviembre: retención automática del buzón local implementada, siete días configurables (1–30). Solo archivos generados por la aplicación con fecha del nombre y modificación antiguas, sin recursión, con límites de borrado/inspección y cierre ordenado. No se ejecutó sobre el buzón del propietario para validar: las pruebas usan directorios temporales. No completa la cola SMTP ni la retención productiva. Ver [MANTENIMIENTO.md](MANTENIMIENTO.md).

Validación: build/tipos, 54 pruebas API, 33 web y cuatro guardas aprobados. Incluye conservación de archivos y mensajes recientes, límite y reanudación, junction, ausencia de carpeta, desactivación, log genérico y validación del plazo. Sin migraciones ni dependencias nuevas. Integración PostgreSQL y Playwright no repetidos porque no cambia su comportamiento; CI remota posterior aprobada junto con la cola: [CI 45640945652](https://github.com/aletorresprado/restaurant/actions/runs/45640945652).

1. Acordar proveedor/costo y activar el envío real cuando haya remitente/SMTP. La cola persistente ya está implementada; configurar su clave privada productiva y supervisión antes de publicar. El buzón local no envía a internet.
2. Definir logs centralizados, alertas y retención de otros datos. CI ya está verificada en GitHub; limpieza y salud PostgreSQL también están implementadas.
3. Hosting, presupuesto, secretos, respaldo/restauración y entorno de prueba, siguiendo [PRODUCCION.md](PRODUCCION.md). Aplicar encabezados CSP y verificar HTTPS/CORS/proxies; CSP por meta no sustituye `frame-ancestors` por cabecera.
4. Ejecutar recorridos en preproducción, accesibilidad, rendimiento y revisión de dependencias antes de solicitar la publicación.

Conservar los límites del producto: asistencia definitiva y manual, historial anterior sin recalcular, sin canjes/vencimiento de puntos y un intervalo semanal por día. No confundir el cierre funcional local con producción.

## Comandos de comprobación

Soporte local añadido: `scripts/reset-local-password.ps1 -Email <correo>` permite al operador restablecer una contraseña olvidada sin perder los datos de la cuenta. Limitado a PostgreSQL local de desarrollo; invalida sesiones de renovación/cookies y access tokens anteriores mediante authVersion; elimina enlaces de cuenta pendientes. Comprobado con una prueba contra PostgreSQL que usa cuentas temporales: hash nuevo válido, contraseña anterior rechazada, datos de perfil/rol/saldo conservados, validación de contraseña y sesiones de otra cuenta intactas. Es una herramienta del operador, complementaria al flujo público descrito en CORREO-CUENTAS.md. Uso en README.

Desde la raíz del repositorio:

```powershell
pnpm.cmd build
pnpm.cmd test
pnpm.cmd lint
pnpm.cmd --filter @repo/api exec prisma validate
pnpm.cmd --filter @repo/api test:integration
pnpm.cmd --filter @repo/web test:e2e
git diff --check
```

La integración necesita una base de desarrollo migrada y crea y elimina sus propios usuarios, sesiones y sucursales temporales. Nunca usar una base de producción para esta prueba. Consultar `README.md` para preparar la conexión y aplicar las migraciones.

# Límites de solicitudes

Implementado el 12 de noviembre de 2026 como primer incremento de la etapa 7. No requiere cuentas, dependencias ni migraciones nuevas.

## Comportamiento

La API limita por dirección IP y grupo. Web y Swagger comparten cuotas: cambiar de cuenta, pestaña, URL dentro del grupo o tipo de sesión no las reinicia. Se cuentan solicitudes exitosas y rechazadas, incluso con datos inválidos, antes de ejecutar los controladores. No se cambia el estado activo de una cuenta ni se exige un desbloqueo administrativo.

Además de esas cuotas, el login incorpora el control de fallos por correo explicado a continuación. La cuota por IP cuenta todos los intentos; la política por correo cuenta solamente credenciales rechazadas.

| Grupo | Límite predeterminado | Ventana | Configuración |
| --- | --- | --- | --- |
| Login web y Bearer | 30 | 15 minutos | `RATE_LIMIT_LOGIN` |
| Registro web y Bearer | 10 | 1 hora | `RATE_LIMIT_REGISTER` |
| Renovación Bearer | 60 | 1 minuto | `RATE_LIMIT_REFRESH` |
| Modificaciones restantes | 120 | 1 minuto | `RATE_LIMIT_WRITE` |
| Consultas GET/HEAD | 300 | 1 minuto | `RATE_LIMIT_READ` |
| Solicitar enlaces de cuenta | 5 | 15 minutos | `RATE_LIMIT_ACCOUNT_REQUEST` |
| Confirmar enlaces de cuenta | 30 | 15 minutos | `RATE_LIMIT_ACCOUNT_CONFIRM` |

Modificaciones incluye reservas, puntos, imágenes y gestión, también PATCH/PUT/DELETE. Las consultas comparten un grupo, incluida disponibilidad. Las cuotas son independientes entre grupos. Logout web/Bearer, OPTIONS y `/api/v1/health` quedan exceptuados; Swagger está fuera de `/api/v1` y su interfaz no consume cuota, pero sus solicitudes a la API sí.

Ventanas fijas desde la primera solicitud de cada IP/grupo. Al agotarse una, se responde **429**, código `RATE_LIMITED`, cabecera `Retry-After` y mensaje con los segundos restantes. Las solicitudes rechazadas no prolongan la espera. El cliente muestra el mensaje, conserva la sesión y no reenvía automáticamente. Reservas y altas de gestión conservan el UUID pendiente: esperar y usar **Verificar y reintentar**. Un 429 en un reintento no significa que el envío anterior haya fallado.

Las variables admiten enteros de 1 a 10000; cero no desactiva la protección. Sus valores predeterminados ya funcionan sin editar `.env`. Reiniciar la API después de cambiar configuración. No guardar el `.env` real en Git.

## Fallos de ingreso por cuenta

El mismo servicio de autenticación aplica una segunda política a `/auth/login` y `/auth/web/login`, antes de consultar credenciales:

- **5 fallos en 15 minutos** para un mismo correo normalizado (sin espacios exteriores y en minúsculas) provocan una **pausa de 60 segundos**. Se comparten entre web/Bearer, pestañas e IP; cambiar de dirección no evita este contador.
- El quinto fallo responde 401 como los anteriores; las peticiones siguientes durante la pausa responden 429, con `Retry-After`, código `RATE_LIMITED` y mensaje genérico. No se comprueba la contraseña ni se emiten sesiones durante la pausa, aunque la contraseña enviada sea correcta.
- Los rechazos 429 no prolongan la pausa. Al terminar se inicia una nueva ventana; un ingreso correcto limpia los fallos de la cuenta, pero no reinicia las cuotas por IP. Una ventana sin llegar al umbral vence a los 15 minutos.
- Solo hay una comprobación de contraseña en curso por correo. Un intento simultáneo recibe 429 con un segundo de espera, sin consumir fallos ni encolar contraseñas; debe reintentarse manualmente. Esto evita que una ráfaga concurrente compruebe muchas contraseñas antes de registrar los fallos.
- Correo inexistente, contraseña incorrecta y usuario desactivado reciben la misma política y el mismo mensaje de credenciales inválidas. Se conserva la comparación con hash ficticio para correos desconocidos. Una pausa no revela si existe una cuenta.
- Los errores de validación/origen no llegan a esta comprobación; los errores de infraestructura no suman fallos. Las cuotas por IP siguen limitando esas solicitudes. Registro, renovación, consulta de sesión y logout mantienen sus contratos anteriores.
- Una pausa no revoca sesiones existentes ni modifica `isActive`, roles, reservas o puntos. Puede seguir usándose una sesión válida y cerrar sesión normalmente.

Configuración opcional en `.env`: `LOGIN_ACCOUNT_FAILURES` (1–20, por defecto 5) y `LOGIN_ACCOUNT_PAUSE_SECONDS` (1–900, por defecto 60). La ventana de observación es fija de 15 minutos. Reiniciar la API después de editar; no hace falta modificar el `.env` para usar los valores predeterminados.

No es un bloqueo permanente ni requiere un administrador para terminar. **Un atacante persistente todavía puede ocasionar pausas repetidas**: este control limita intentos distribuidos, pero no elimina el riesgo de denegación de acceso dirigida. Recuperación/verificación ya cuentan con flujo local y adaptador SMTP; entrega real, cola persistente, MFA y monitoreo siguen pendientes. Los valores son una política inicial del proyecto, no un umbral universal certificado. Referencia: [OWASP, Login Throttling y Account Lockout](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html#login-throttling).

Los contadores por correo también son de un solo proceso, con hasta 10000 claves hash, sin contraseñas/correos en texto ni persistencia/logs. Los vencidos se limpian con solicitudes; no se expulsan contadores activos para admitir otros. Al llenarse, un correo sin contador recibe 429/60 segundos. Se borran al reiniciar y necesitan un almacén compartido antes de varias instancias. Un hash no debe interpretarse como anonimización irreversible.

## Proxies y despliegue

Sin `TRUSTED_PROXY_IPS`, Express toma la IP de la conexión e ignora `X-Forwarded-For`. Si existe un proxy controlado, configurar solamente sus direcciones IP explícitas separadas por coma. No se admiten `true`, cantidad de saltos ni nombres de redes. El proxy debe sobrescribir los encabezados reenviados y la API debe ser accesible solamente por los intermediarios previstos. La selección depende de la topología real; verificarla antes de publicar. Referencia: [Express detrás de proxies](https://expressjs.com/en/guide/behind-proxies/).

Vite actúa como proxy en desarrollo: las solicitudes locales comparten la IP del proxy. Eso es esperado. En producción, una configuración incorrecta puede agrupar a todos los clientes o permitir falsificar direcciones.

## Límites de esta entrega

- Contadores en memoria de **un proceso**: reiniciar la API borra cuotas. No desplegar varias instancias/workers confiando en estos contadores; agregar antes un almacén compartido y comprobar concurrencia entre instancias.
- IPs compartidas por una familia, empresa o red móvil comparten cuotas. El contador por correo complementa la protección ante intentos distribuidos sobre una cuenta; distribuir intentos entre muchas cuentas/IP sigue requiriendo controles adicionales. No hay CAPTCHA ni protección DDoS de infraestructura.
- Hasta 10000 contadores activos, con claves hash de IP, sin contraseñas, correos ni tokens. Los vencidos se limpian al llegar solicitudes, como máximo una vez por minuto, y el contador solicitado también se renueva al vencer. Si se llena la capacidad, nuevas IP/grupo reciben 429 con espera de 60 segundos sin expulsar cuotas activas. No hay retención en disco ni logs de direcciones.
- Ventanas fijas permiten una ráfaga al final y otra al principio de la siguiente; ajustar con mediciones reales. No sustituye límites de tamaño de solicitudes, concurrencia, CSP, HTTPS ni monitoreo.
- Logout no tiene cuota en este incremento para preservar la posibilidad de salir; proteger el volumen total en el perímetro del despliegue.

El contrato 429 y `Retry-After` sigue la [referencia HTTP](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Status/429).

## Validación

Las pruebas de API cubren grupos compartidos, expiración sin prórroga por rechazos, separación por IP, memoria acotada, exclusiones y configuración. Una prueba HTTP con Nest y controladores de prueba confirma que una solicitud limitada no ejecuta el controlador. Las pruebas web comprueban mensaje, ausencia de reenvío automático, sesión conservada y recuperación de gestión con el mismo UUID después de 429.

El control por correo agrega pruebas de cinco fallos, pausa sin prórroga, reinicio al ingresar correctamente, vencimiento, aislamiento de otras cuentas, concurrencia y errores de infraestructura. HTTP verifica que web/Bearer comparten el contador, que 429 no emite cookie/tokens y que un correo inexistente sigue la misma política. PostgreSQL confirma que no se crean sesiones durante la pausa ni se desactiva la cuenta, y que las sesiones vigentes/logout siguen funcionando. El navegador verifica el mensaje y los datos conservados del formulario en escritorio/móvil.

Resultado del 12 de noviembre: build, tipos, 68 pruebas unitarias/HTTP (35 API + 33 web), integración PostgreSQL y diez recorridos aislados de `pnpm.cmd --filter @repo/web test:security` aprobados en 50,4 segundos. Sin nuevas migraciones ni prueba de carga. Las pruebas usan cuentas temporales propias; no intentar reproducir cinco fallos contra cuentas reales para verificar la implementación.

La integración PostgreSQL usa cuotas IP de 10000 en su proceso temporal para ejecutar muchos flujos desde una IP; no desactiva el middleware ni cambia el `.env`. El control por correo conserva cinco fallos y 60 segundos. Las pruebas específicas de límites usan cuotas bajas. Para repetir toda la suite de navegador contra un mismo servidor local, tener en cuenta que los registros/logins automatizados consumen las cuotas normales; usar un proceso de pruebas dedicado, sin modificar los límites de producción.

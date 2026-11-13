# Integración continua en GitHub Actions

Implementada y verificada en GitHub el 13 de noviembre de 2026. Workflow: `.github/workflows/ci.yml`. Comprueba el código con PostgreSQL aislado; no publica la aplicación ni ejecuta migraciones contra el hosting real.

## Cuándo se ejecuta

- Push a `main`.
- Pull request dirigido a `main`.
- Inicio manual desde **Actions → CI → Run workflow**, una vez que el archivo esté en la rama predeterminada.

Una ejecución nueva cancela la anterior de la misma referencia/PR. Se usa un runner nuevo Ubuntu 24.04, Node **22.19.0** de `.node-version`, pnpm **9.15.4** de `packageManager` y PostgreSQL **16** como servicio temporal. El job tiene un máximo de 25 minutos. Las acciones están fijadas a revisiones SHA obtenidas de sus repositorios oficiales; se deben revisar al actualizarlas.

## Qué comprueba

1. Checkout con token de lectura y sin persistir credenciales Git; instalación con `--frozen-lockfile`.
2. PostgreSQL listo y creación del usuario `resto_ci`, sin superusuario, creación de bases ni roles. Se convierte en propietario únicamente de la base temporal `app_resto_ci`.
3. Generación del cliente Prisma, guardas del destino y comprobación real de permisos mediante `pnpm ci:preflight`.
4. Validación del esquema, aplicación de migraciones versionadas a una base vacía y `prisma migrate status`.
5. Compilación del monorepo, tipos y pruebas unitarias/HTTP.
6. Integración PostgreSQL y prueba del restablecimiento local del operador con cuentas temporales.
7. Instalación de Chromium/dependencias Linux y veinte recorridos generales de escritorio/móvil.
8. Doce recorridos adicionales del build, CSP, recuperación/verificación de correo y pausa de ingreso.
9. Revisión de espacios con `git diff --check`.

Un fallo deja el job en rojo. Los navegadores usan un worker y cero reintentos automáticos; CI rechaza pruebas marcadas con `.only`. No se crea un administrador real ni se ejecuta el seed operativo. Las cuentas, sucursales y correos son fixtures sintéticos.

## Aislamiento

El servicio PostgreSQL pertenece exclusivamente al job y se elimina con el runner al terminar. Las credenciales del YAML son valores públicos de prueba que solo sirven dentro de ese servicio efímero; no deben reutilizarse en el hosting. No se usan secretos del proyecto ni SMTP externo.

`scripts/test-database.cjs` centraliza la guarda para integración, pruebas del operador y recorridos de navegador:

- En desarrollo local, solo permite PostgreSQL loopback y base `app_resto_dev`, con `NODE_ENV=development`.
- Con `CI=true` o `CI=1`, solo permite loopback y `app_resto_ci` o `app_resto_ci_<8 hex>`, también en modo development. **Rechaza `app_resto_dev` en CI**, además de destinos externos, bases con otros nombres y modo production.
- En CI no carga el `.env` local. Nest también ignora el archivo `.env` cuando CI está activo; las variables del job son explícitas. En un checkout limpio de GitHub no existen archivos de entorno privados. Prisma CLI puede anunciar la lectura de `.env` al reproducir comandos en un equipo local: el `DATABASE_URL` explícito del proceso tiene prioridad; el preflight valida ese destino antes de migrar.
- `ci:preflight` consulta los permisos del usuario real conectado y falla si es administrador. Los filtros de host/nombre son una protección adicional, no sustituyen configurar correctamente una base realmente descartable.

Los servidores de Playwright no reutilizan servicios preexistentes en CI. Sus cuotas IP son altas para ejecutar fixtures desde una IP; los límites de fallos por correo conservan su política. El mantenimiento programado se deshabilita en servidores de prueba para que ninguna tarea retire registros ajenos a sus fixtures. La limpieza tiene su prueba SQL independiente con tablas temporales.

No se suben buzones, archivos `.env`, trazas, capturas ni informes como artefactos del workflow. Los resultados se consultan en los logs del job; no añadir credenciales reales para depurarlo. La configuración no compra servicios ni habilita facturación; la disponibilidad de Actions depende de la configuración del repositorio y del plan del propietario.

## Cómo revisar una ejecución

1. Subir el commit autorizado con el workflow.
2. Abrir el repositorio en GitHub y entrar en **Actions → CI**.
3. Seleccionar la ejecución del commit y el job **Build, tests and isolated PostgreSQL**.
4. Comprobar que los pasos estén verdes. Si falla, abrir el primer paso rojo y revisar el error sin pegar secretos ni enlaces de cuenta.
5. Antes de considerar CI verificada en GitHub, registrar el enlace de esa ejecución aprobada. Un workflow revisado localmente no garantiza por sí solo que la primera corrida de Linux apruebe.

No se configuraron reglas de protección de `main`; si se decide hacer obligatorio este resultado antes de integrar cambios, se configura por separado en GitHub después de que el chequeo exista. El job no despliega ni modifica entornos de producción.

## Reproducción local

Las comprobaciones habituales conservan sus comandos:

```powershell
pnpm.cmd test:guards
pnpm.cmd build
pnpm.cmd lint
pnpm.cmd test
pnpm.cmd --filter @repo/api test:integration
pnpm.cmd --filter @repo/web test:e2e
pnpm.cmd --filter @repo/web test:security
```

Para probar CI localmente hace falta una base descartable distinta de `app_resto_dev`, creada por el operador y propiedad de un usuario sin privilegios de administración. Exportar `CI=true`, `NODE_ENV=development`, `DATABASE_URL` apuntando a `app_resto_ci`/sufijo permitido y variables de autenticación de prueba; ejecutar `ci:preflight` antes de `db:deploy`. No copiar el `.env` real al workflow, no apuntar a producción y no renombrar la base de desarrollo para saltar la guarda. Al terminar, retirar únicamente la base creada para esa prueba y restaurar las variables de la terminal. No hay un comando público que cree o borre bases automáticamente.

## Estado de validación

**Primera ejecución remota completa aprobada:** [CI 43459544441](https://github.com/aletorresprado/restaurant/actions/runs/43459544441), commit `ab7b4bf`, 13 de noviembre de 2026. Runner Ubuntu 24.04, Node 22.19.0 y servicio PostgreSQL 16. Todos los pasos y su limpieza posterior finalizaron con `success`.

Resultados remotos: instalación con lockfile; usuario sin privilegios elevados; cliente/esquema Prisma y diez migraciones; build y tipos; cuatro guardas; 48 pruebas API y 33 web; integración PostgreSQL y prueba del restablecimiento del operador; **20 recorridos generales en 1,9 minutos y 12 de seguridad en 43,1 segundos**. No hubo reintentos automáticos ni se omitieron suites. Los contenedores se retiraron al terminar y no se desplegó ni se consultó producción.

Primera ejecución real: [CI 43458914719](https://github.com/aletorresprado/restaurant/actions/runs/43458914719), commit `c8545f1`. Ubuntu y PostgreSQL iniciaron correctamente; pnpm falló al leer un BOM UTF-8 en `package.json`. Se normaliza la codificación de `package.json` y `turbo.json` sin cambiar dependencias; se agrega una comprobación de JSON sin BOM a `test:guards` (cuatro pruebas). La repetición completa aprobó y queda registrada a continuación.

Se valida la sintaxis con actionlint 1.7.12, descargado de su publicación oficial y verificado con su checksum. Se reproducen los comandos en Windows con PostgreSQL local y una base nueva de CI, sin modificar la base de desarrollo. La base temporal se retira después de la ejecución. Esta validación local es distinta de la ejecución Ubuntu de GitHub, que también aprobó y se registra en esta sección.

Resultado local: tres guardas aprobadas; usuario sin privilegios confirmado; diez migraciones aplicadas desde cero y segunda aplicación sin pendientes; esquema, build, tipos, 81 pruebas API/web, integración PostgreSQL y prueba del operador aprobados. Las primeras corridas generales aprobaron 19/20 y 18/20, con fallos de tiempo concentrados en bloqueos; una repetición aislada aprobó móvil y falló escritorio en ingreso. Se corrigió la sincronización de su helper: confirma el resultado HTTP y espera la sesión visible y la redirección, antes de continuar. Después, la última corrida general aprobó **20/20 en 2,8 minutos**, y la suite independiente de seguridad **12/12 en 59,7 segundos**. No se cambió la lógica ni los timeouts de producción ni se habilitaron reintentos automáticos. Las bases descartables se eliminaron al terminar. Estos resultados son locales en Windows; la verificación Linux también aprobó, según la evidencia remota siguiente.

Referencias: [servicios PostgreSQL en GitHub Actions](https://docs.github.com/en/actions/tutorials/use-containerized-services/create-postgresql-service-containers), [Playwright en CI](https://playwright.dev/docs/ci-intro), [actionlint](https://github.com/rhysd/actionlint).

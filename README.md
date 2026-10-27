# App Resto

Monorepo pnpm con API NestJS, validación Zod y tipos compartidos.

## Estado

Implementado: registro de clientes, login, perfil autenticado, renovación de sesión con rotación de refresh tokens y logout. Usuarios y sesiones persisten en PostgreSQL con Prisma. El registro público siempre crea clientes; el administrador se crea mediante un comando explícito.

Pendiente: sucursales, mesas, horarios, reservas, fidelización y frontend. Los tipos y esquemas compartidos de esos módulos son una base, no endpoints implementados.

El [plan de desarrollo](docs/PLAN.md) detalla el orden de implementación y los criterios para completar cada etapa. La próxima etapa es implementar permisos por rol y gestión de sucursales.

## Requisitos

- Node.js 22.19 o superior y pnpm 9.15.4.
- PostgreSQL 16 local, o Docker con Compose para usar `compose.yaml`.
- No hace falta una cuenta de un proveedor externo para desarrollo local.

En PowerShell se puede usar `pnpm.cmd` si la política de scripts bloquea `pnpm.ps1`.

## Inicio local

Desde la raíz:

```powershell
pnpm.cmd install --frozen-lockfile
docker compose up -d db
if (!(Test-Path apps/api/.env)) { Copy-Item apps/api/.env.example apps/api/.env }
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Si ya existe `.env`, conservarlo y editarlo en lugar de copiar encima. Pegar el secreto generado en `JWT_ACCESS_SECRET`. El `DATABASE_URL` del ejemplo coincide con la base de Compose. Si usás PostgreSQL instalado directamente, crear una base vacía y ajustar usuario, contraseña, puerto y nombre. Las credenciales de Compose son solo para desarrollo local.

```powershell
pnpm.cmd db:generate
pnpm.cmd --filter @repo/api db:deploy
pnpm.cmd build
pnpm.cmd --filter @repo/api start
```

Desarrollo con recarga: `pnpm.cmd dev` después de generar Prisma y compilar los paquetes compartidos. Si modificás un paquete compartido, volver a compilarlo para que la API reciba el cambio.

La API verifica las variables y conecta a PostgreSQL durante el arranque: sin una base accesible no inicia. No se crean tablas automáticamente; aplicar las migraciones antes de arrancar.

- Salud: http://localhost:3000/api/v1/health
- Swagger interactivo: http://localhost:3000/api/docs

Si la descarga del motor Prisma falla por certificados en Windows con Node 22.19+, probar `$env:NODE_USE_SYSTEM_CA='1'` antes de `pnpm.cmd db:generate`. No desactivar la validación TLS.

## Autenticación

Todos los endpoints llevan el prefijo `/api/v1/auth`:

| Método | Ruta | Datos |
| --- | --- | --- |
| POST | `/register` | firstName, lastName, email, password; phone opcional |
| POST | `/login` | email, password |
| POST | `/refresh` | refreshToken |
| POST | `/logout` | refreshToken |
| GET | `/me` | Header Authorization: Bearer accessToken |

Registro y login devuelven `user`, `accessToken` y `refreshToken`. La contraseña requiere al menos 8 caracteres, una mayúscula y un número; máximo 72 bytes por el límite de bcrypt. Correos normalizados a minúsculas. Nunca se devuelven hashes de contraseñas.

Al renovar, reemplazar ambos tokens en el cliente: el refresh anterior deja de funcionar. Logout revoca el refresh presentado; el access token sigue vigente hasta su expiración (15 minutos por defecto). No se implementa todavía revocación inmediata del access token ni logout de todos los dispositivos. Las sesiones vencidas se rechazan, pero aún no hay tarea de limpieza de sus registros.

## Administrador inicial

Configurar `ADMIN_EMAIL` y `ADMIN_PASSWORD` en `apps/api/.env` y ejecutar:

```powershell
pnpm.cmd build
pnpm.cmd db:seed
```

El comando crea un administrador y falla si ese correo ya existe; no eleva permisos de cuentas existentes. Quitar las variables de seed luego de usarlo.

## Validación

```powershell
pnpm.cmd build
pnpm.cmd test
pnpm.cmd lint
pnpm.cmd --filter @repo/api exec prisma validate
```

Las 11 pruebas cubren configuración, rotación, expiración y revocación de sesiones, además de registro, login y acceso autenticado mediante HTTP. El acceso a datos está simulado: no reemplazan una prueba de integración contra PostgreSQL. `db:migrate` sirve para crear nuevas migraciones durante desarrollo; `db:deploy` aplica las versionadas.

Para probar contra una base real ya migrada, compilar y ejecutar `pnpm.cmd --filter @repo/api test:integration`. El comando inicia una API temporal en un puerto libre, comprueba registro, persistencia, login, perfil privado, renovación concurrente, cierre de sesión y desactivación. Al finalizar detiene esa API y elimina únicamente su usuario de prueba y sus sesiones. No ejecutarlo contra producción.

## Instalación local de este equipo

Esta sección describe el equipo de desarrollo ya configurado; clonar el repositorio no instala PostgreSQL ni copia las credenciales. Para un equipo nuevo, seguir primero «Inicio local». Usar PostgreSQL instalado o Docker, uno por vez: ambos ejemplos utilizan el puerto 5432.

PostgreSQL 16 está instalado como servicio de Windows `postgresql-x64-16`, en el puerto 5432. La base es `app_resto_dev`, y la API usa el rol `app_resto`, sin permisos de superusuario ni creación de roles o bases.

`apps/api/.env` contiene la conexión configurada. Las credenciales locales de administración y de aplicación se guardan en `.env.postgres.local`, excluido de Git. La configuración anterior de la API se conserva en `.env.api-before-postgres.local`, también excluida de Git. No compartir ni versionar estos archivos.

No es necesario Docker para esta instalación. Para volver a configurar la conexión con esas credenciales, ejecutar `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/configure-local-postgres.ps1`. El script conserva roles y bases existentes y comprueba la conexión antes de editar `.env`.

Para iniciar la API después de reiniciar el equipo:

```powershell
pnpm.cmd --filter @repo/api start
```

Antes de exponer la API a internet, agregar límites de intentos de autenticación, política CORS por dominio y HTTPS, y definir recuperación de contraseñas/verificación de correo. Esas funciones aún no están implementadas.

## Cómo continuar el proyecto

Seguir las etapas de [docs/PLAN.md](docs/PLAN.md). En cada cambio, actualizar este README con el comportamiento real, los comandos y las limitaciones que correspondan; actualizar también el plan cuando cambie el estado de una etapa. Registrar las validaciones realizadas antes de hacer commit y subir los cambios. No incluir archivos `.env`, credenciales ni logs en Git.

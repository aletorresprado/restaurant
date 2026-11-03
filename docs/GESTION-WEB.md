# Agenda y administración desde la web

Disponible desde el 3 de noviembre de 2026, conservando el diseño adaptado de Lovable y las reglas de la API. No agrega servicios externos, migraciones ni cambios de reglas de negocio.

## Acceso inicial

Iniciar los servicios con `pnpm.cmd dev` y abrir `http://127.0.0.1:5173/`.

- CUSTOMER: reservas propias y fidelización.
- STAFF: enlace **Agenda**, únicamente sucursales activas asignadas.
- ADMIN: enlaces **Agenda** y **Administración**, con alcance global según la API.

El login dirige al área correspondiente. Recargar conserva la sesión de la pestaña. Las pantallas muestran acceso denegado a roles incompatibles, y la API verifica el rol actual y la asignación en cada operación; ocultar enlaces no reemplaza esa autorización.

Si todavía no hay un administrador, crearlo explícitamente desde una segunda terminal en la raíz del proyecto:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\create-admin.ps1
```

El comando pide un correo nuevo y una contraseña oculta de al menos 8 caracteres, una mayúscula y un número. No escribe credenciales en archivos ni modifica cuentas existentes. Las variables del proceso se restauran al finalizar. Se usa el seed existente y la base configurada en `apps/api/.env`. No se requiere un buzón real para estas pruebas locales: todavía no se envían correos ni se verifica su propiedad. Guardar las credenciales elegidas en un gestor de contraseñas.

Cerrar la sesión de cliente en la app e ingresar con la nueva cuenta. Un correo ya registrado como cliente no sirve para crear el administrador con este comando; elegir otro. No hay creación pública de administradores ni promoción de clientes a ADMIN desde la web.

## Agenda

1. Elegir sucursal y fecha de inicio del servicio. Un servicio nocturno conserva la fecha en que comenzó.
2. Consultar reservas paginadas, estado, cliente, contacto, mesa e historial. La agenda se actualiza cada 30 segundos y tiene botón de actualización manual.
3. **Registrar asistencia** desde el inicio. **Registrar ausencia** después de la tolerancia de 30 minutos. **Cancelar reserva** antes del inicio, con motivo obligatorio.
4. Revisar la confirmación y registrar el resultado. La API aplica los puntos y mantiene o libera la ocupación según corresponda.

Los controles de horario son orientativos con el reloj del navegador; la API decide con su propio reloj. El resultado de asistencia es definitivo. Después de un error se consulta la agenda para comprobar el estado real. Los reintentos del mismo resultado o cancelación no duplican eventos ni puntos.

## Administración

Seleccionar una cuenta en **Usuarios**, con navegación por páginas. Se puede:

- Consultar saldo, nivel e historial de puntos con autor, motivo y referencias de auditoría.
- Revisar y confirmar un ajuste entero entre −10000 y 10000, distinto de cero y con motivo obligatorio.
- Habilitar una cuenta como personal y asignarla o retirarla de sucursales existentes.
- Cambiar personal a cliente, previa confirmación: elimina sus asignaciones. No modifica administradores.

Cada ajuste tiene un UUID. Antes del envío, la confirmación puede cancelarse para editar. Después de un resultado incierto, se conservan UUID y contenido en `sessionStorage`, por administrador y cuenta destinataria. Volver a seleccionar esa cuenta después de recargar permite confirmar/reintentar la misma operación sin duplicarla. Los datos no se pueden editar mientras esa operación siga pendiente. No borrar el almacenamiento ni duplicar la operación en otra pestaña para resolver una conexión interrumpida; el mecanismo actual se limita a esa pestaña y requiere revisión de coordinación entre pestañas antes de producción.

## Alcance pendiente

Esta entrega cubre agenda, resultados, cancelaciones, usuarios, asignaciones y puntos. Todavía no hay formularios web para altas/edición/desactivación de sucursales, mesas, horarios, excepciones ni bloqueos: sus endpoints siguen disponibles en Swagger. Tampoco hay búsqueda de usuarios en el servidor, creación pública de administradores, corrección de resultados terminales ni automatización de ausencias.

## Verificación

Recorridos de navegador con usuarios y sucursales temporales en PostgreSQL, en escritorio y móvil: acceso por rol, aislamiento de sucursal, asistencia y ausencia con puntos, cancelación con motivo, auditoría, ajuste con respuesta de red perdida y reintento después de recargar sin duplicación, cambio de rol y asignación. Se conserva el recorrido de cliente y encuesta. Las pruebas eliminan sus propios datos; ejecutar solo contra desarrollo.

Validado: compilación web, chequeo de tipos, 23 pruebas de API/web y cuatro recorridos Playwright aprobados (cliente y gestión, en escritorio y móvil). Se revisaron las capturas y la ausencia de desbordamiento horizontal. El script de creación de administrador se verificó sintácticamente; no se ejecutó para crear cuentas permanentes, porque las credenciales las elige el propietario en su terminal.

Comandos: `pnpm.cmd --filter @repo/web build`, `pnpm.cmd test`, `pnpm.cmd lint` y `pnpm.cmd --filter @repo/web test:e2e`.

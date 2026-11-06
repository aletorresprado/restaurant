import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { BUSINESS_CONFIG } from '@repo/config';
import {
  CreateBranchScheduleSchema,
  UpdateBranchScheduleSchema,
  CreateBranchScheduleExceptionSchema,
  UpdateBranchScheduleExceptionSchema,
} from '@repo/validation';
import { api, post, ApiError, errorMessage, type Branch, type Page } from '@/lib/api';
import { useStore } from '@/lib/store';
import { restaurantDate, formatDateTime, dateLabel } from '@/lib/format';
import { Button, Container, Field, Notice, inputClass } from '@/components/kit';
import { Pager, QueryError, useManagedBranches } from './common';

type Weekly = {
  id: string;
  dayOfWeek: number;
  openingTime: string;
  closingTime: string;
  reservationIntervalMinutes: number;
  isActive: boolean;
};
type Exception = {
  id: string;
  date: string;
  isClosed: boolean;
  openingTime: string | null;
  closingTime: string | null;
  reason: string | null;
};
type Editor =
  | { kind: 'weekly'; item: Weekly | 'new'; remove?: boolean }
  | { kind: 'exception'; item: Exception | 'new'; remove?: boolean };
const days = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const windowLabel = (open: string | null, close: string | null) =>
  open && close ? `${open} a ${close}${close < open ? ' del día siguiente' : ''}` : 'Sin horario';

export function ScheduleManagement({
  requestedBranch,
  onBranchChange,
}: {
  requestedBranch?: string;
  onBranchChange: (id: string) => void;
}) {
  const { user } = useStore();
  const branches = useManagedBranches(user?.role === 'ADMIN');
  const [editingBranch, setEditingBranch] = useState<string | null>(null);
  const branch = requestedBranch
    ? branches.data?.find((item) => item.id === requestedBranch)
    : branches.data?.[0];
  return (
    <Container className="max-w-3xl py-10">
      <h1 className="text-3xl font-semibold">Horarios y excepciones</h1>
      <p className="mt-2 text-muted-foreground">
        Un servicio por día, en la zona del restaurante: {BUSINESS_CONFIG.timezone}.
      </p>
      {branches.isPending ? (
        <p className="mt-6">Cargando sucursales…</p>
      ) : branches.error ? (
        <div className="mt-6">
          <QueryError error={branches.error} retry={branches.refetch} />
        </div>
      ) : !branches.data?.length ? (
        <div className="mt-6">
          <Notice title="No hay sucursales disponibles">
            {user?.role === 'ADMIN'
              ? 'Creá una sucursal desde Administración.'
              : 'Pedile a un administrador que te asigne una sucursal activa.'}
          </Notice>
        </div>
      ) : (
        <>
          <div className="mt-6">
            <Field label="Sucursal de los horarios" htmlFor="hours-branch">
              <select
                id="hours-branch"
                className={inputClass}
                value={branch?.id ?? ''}
                disabled={!!branch && editingBranch === branch.id}
                onChange={(event) => {
                  setEditingBranch(null);
                  onBranchChange(event.target.value);
                }}
              >
                <option value="" disabled>
                  Elegí una sucursal
                </option>
                {branches.data.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.name}
                    {!item.isActive ? ' (inactiva)' : ''}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          {!branch ? (
            <div className="mt-4">
              <Notice title="La sucursal no está disponible para tu cuenta">
                Elegí otra sucursal autorizada.
              </Notice>
            </div>
          ) : (
            <BranchSchedules
              key={`${user?.id}:${branch.id}`}
              branch={branch}
              onEditingChange={(value) => setEditingBranch(value ? branch.id : null)}
            />
          )}
        </>
      )}
    </Container>
  );
}

function BranchSchedules({
  branch,
  onEditingChange,
}: {
  branch: Branch;
  onEditingChange: (value: boolean) => void;
}) {
  const { user } = useStore();
  const client = useQueryClient();
  const root = `/staff/branches/${branch.id}`;
  const [page, setPage] = useState(1),
    [editor, setEditor] = useState<Editor | null>(null),
    [success, setSuccess] = useState('');
  const weekly = useQuery({
    queryKey: ['management', user?.id, 'schedules', branch.id],
    queryFn: () => api<Weekly[]>(`${root}/schedules`, {}, true),
    retry: false,
  });
  const exceptions = useQuery({
    queryKey: ['management', user?.id, 'exceptions', branch.id, page],
    queryFn: () =>
      api<Page<Exception>>(`${root}/schedule-exceptions?page=${page}&limit=10`, {}, true),
    retry: false,
  });
  const edit = (value: Editor | null) => {
    setEditor(value);
    onEditingChange(!!value);
    if (value) setSuccess('');
  };
  const refresh = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ['management'] }),
      client.invalidateQueries({ queryKey: ['hours'] }),
      client.invalidateQueries({ queryKey: ['availability'] }),
    ]);
  };
  const saved = async (message: string) => {
    await refresh();
    edit(null);
    setSuccess(message);
  };
  const renderEditor = (kind: Editor['kind']) => {
    if (!editor || editor.kind !== kind) return null;
    const item = editor.item;
    if (editor.remove && item !== 'new')
      return (
        <RemoveHours
          key={`remove:${item.id}`}
          root={root}
          kind={kind}
          id={item.id}
          onClose={() => edit(null)}
          onRefresh={refresh}
          onSaved={() =>
            saved(
              kind === 'weekly'
                ? 'Horario semanal eliminado.'
                : 'Excepción eliminada. Se vuelve a aplicar el horario semanal, si existe.',
            )
          }
        />
      );
    if (editor.kind === 'weekly')
      return (
        <WeeklyForm
          key={editor.item === 'new' ? 'new-weekly' : editor.item.id}
          root={root}
          item={editor.item === 'new' ? null : editor.item}
          usedDays={weekly.data?.map((item) => item.dayOfWeek) ?? []}
          onClose={() => edit(null)}
          onRefresh={refresh}
          onSaved={() => saved('Horario semanal guardado.')}
        />
      );
    return (
      <ExceptionForm
        key={editor.item === 'new' ? 'new-exception' : editor.item.id}
        root={root}
        item={editor.item === 'new' ? null : editor.item}
        onClose={() => edit(null)}
        onRefresh={refresh}
        onSaved={() => saved('Excepción guardada.')}
      />
    );
  };
  return (
    <>
      {!branch.isActive && (
        <div className="mt-4">
          <Notice title="Sucursal inactiva">
            Podés preparar sus horarios como administrador. Esto no reactiva la sucursal ni habilita
            reservas.
          </Notice>
        </div>
      )}
      <p className="mt-4 text-sm text-muted-foreground">
        Un cierre anterior a la apertura termina el día siguiente. Cerrar el servicio de una fecha
        no recorta el servicio nocturno que comenzó el día anterior.
      </p>
      {success && (
        <div className="mt-4">
          <Notice tone="success">{success}</Notice>
        </div>
      )}
      <section className="mt-6" aria-label="Horarios semanales">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-2xl font-semibold">Horarios semanales</h2>
          <Button
            size="sm"
            disabled={
              !!editor || weekly.isPending || !!weekly.error || (weekly.data?.length ?? 0) >= 7
            }
            onClick={() => edit({ kind: 'weekly', item: 'new' })}
          >
            Nuevo horario
          </Button>
        </div>
        {renderEditor('weekly')}
        <div className="mt-4">
          {weekly.isPending ? (
            <p>Cargando horarios…</p>
          ) : weekly.error ? (
            <QueryError error={weekly.error} retry={weekly.refetch} />
          ) : !weekly.data?.length ? (
            <Notice title="Todavía no hay horarios semanales">
              Los días sin horario activo no inician servicio, salvo que tengan una excepción
              abierta.
            </Notice>
          ) : (
            <ul className="space-y-3">
              {weekly.data.map((item) => (
                <li key={item.id} className="rounded-2xl border border-border bg-card p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-xl font-semibold">{days[item.dayOfWeek - 1]}</h3>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${item.isActive ? 'bg-success-soft text-success' : 'bg-muted text-muted-foreground'}`}
                    >
                      {item.isActive ? 'Servicio activo' : 'Servicio inactivo'}
                    </span>
                  </div>
                  <p className="mt-2">{windowLabel(item.openingTime, item.closingTime)}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Turnos cada {item.reservationIntervalMinutes} minutos.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={!!editor}
                      aria-label={`Editar horario ${days[item.dayOfWeek - 1]}`}
                      onClick={() => edit({ kind: 'weekly', item })}
                    >
                      Editar horario
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={!!editor}
                      aria-label={`Eliminar horario ${days[item.dayOfWeek - 1]}`}
                      onClick={() => edit({ kind: 'weekly', item, remove: true })}
                    >
                      Eliminar horario
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        {weekly.data && (
          <p className="mt-3 text-sm text-muted-foreground">
            Días sin servicio semanal activo:{' '}
            {days
              .filter(
                (_, i) => !weekly.data.some((item) => item.dayOfWeek === i + 1 && item.isActive),
              )
              .join(', ') || 'ninguno'}
            .
          </p>
        )}
      </section>
      <section className="mt-8 border-t border-border pt-6" aria-label="Excepciones por fecha">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-2xl font-semibold">Excepciones por fecha</h2>
          <Button
            size="sm"
            disabled={!!editor || exceptions.isPending || !!exceptions.error}
            onClick={() => edit({ kind: 'exception', item: 'new' })}
          >
            Nueva excepción
          </Button>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Una excepción reemplaza el servicio de su fecha: cierre o apertura especial. El motivo es
          interno.
        </p>
        {renderEditor('exception')}
        <div className="mt-4">
          {exceptions.isPending ? (
            <p>Cargando excepciones…</p>
          ) : exceptions.error ? (
            <QueryError error={exceptions.error} retry={exceptions.refetch} />
          ) : !exceptions.data?.data.length ? (
            <Notice title="No hay excepciones por fecha" />
          ) : (
            <ul className="space-y-3">
              {exceptions.data.data.map((item) => (
                <li key={item.id} className="rounded-2xl border border-border bg-card p-5">
                  <h3 className="text-xl font-semibold">{item.date}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{dateLabel(item.date)}</p>
                  <p className="mt-2">
                    {item.isClosed
                      ? 'No inicia servicio'
                      : windowLabel(item.openingTime, item.closingTime)}
                  </p>
                  {item.reason && <p className="mt-2 break-words text-sm">Motivo: {item.reason}</p>}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={!!editor}
                      aria-label={`Editar excepción ${item.date}`}
                      onClick={() => edit({ kind: 'exception', item })}
                    >
                      Editar excepción
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={!!editor}
                      aria-label={`Eliminar excepción ${item.date}`}
                      onClick={() => edit({ kind: 'exception', item, remove: true })}
                    >
                      Eliminar excepción
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        {exceptions.data && !editor && (
          <Pager page={page} totalPages={exceptions.data.meta.totalPages} onChange={setPage} />
        )}
      </section>
      {!editor && (
        <Button variant="secondary" className="mt-5" onClick={() => void refresh()}>
          Actualizar horarios
        </Button>
      )}
      <ServicePreview branch={branch} />
    </>
  );
}

type FormActions = {
  root: string;
  onClose: () => void;
  onRefresh: () => Promise<void>;
  onSaved: () => Promise<void>;
};
function WeeklyForm({
  root,
  item,
  usedDays,
  onClose,
  onRefresh,
  onSaved,
}: FormActions & { item: Weekly | null; usedDays: number[] }) {
  const [day, setDay] = useState(
      item?.dayOfWeek ?? days.findIndex((_, index) => !usedDays.includes(index + 1)) + 1,
    ),
    [open, setOpen] = useState(item?.openingTime ?? '12:00'),
    [close, setClose] = useState(item?.closingTime ?? '23:00'),
    [interval, setInterval] = useState(String(item?.reservationIntervalMinutes ?? 30)),
    [active, setActive] = useState(item?.isActive ?? true);
  const [busy, setBusy] = useState(false),
    [confirm, setConfirm] = useState(false),
    [uncertain, setUncertain] = useState(false),
    [error, setError] = useState(''),
    [errors, setErrors] = useState<Record<string, string>>({});
  const changed =
    !item ||
    open !== item.openingTime ||
    close !== item.closingTime ||
    Number(interval) !== item.reservationIntervalMinutes ||
    active !== item.isActive;
  const resetConfirm = () => setConfirm(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || uncertain || !changed) return;
    setError('');
    setErrors({});
    const complete = CreateBranchScheduleSchema.safeParse({
      dayOfWeek: day,
      openingTime: open,
      closingTime: close,
      reservationIntervalMinutes: Number(interval),
      isActive: active,
    });
    if (!complete.success) {
      setErrors(
        Object.fromEntries(
          complete.error.issues.map((issue) => [String(issue.path[0]), issue.message]),
        ),
      );
      return;
    }
    if (item?.isActive && !active && !confirm) {
      setConfirm(true);
      return;
    }
    const body = item
      ? UpdateBranchScheduleSchema.parse({
          ...(open !== item.openingTime ? { openingTime: open } : {}),
          ...(close !== item.closingTime ? { closingTime: close } : {}),
          ...(Number(interval) !== item.reservationIntervalMinutes
            ? { reservationIntervalMinutes: Number(interval) }
            : {}),
          ...(active !== item.isActive ? { isActive: active } : {}),
        })
      : complete.data;
    setBusy(true);
    try {
      await (item
        ? api(`${root}/schedules/${item.id}`, { method: 'PATCH', body: JSON.stringify(body) }, true)
        : post(`${root}/schedules`, body, true));
      await onSaved();
    } catch (err) {
      setError(errorMessage(err));
      if (!item && err instanceof ApiError && (err.status === 0 || err.status >= 500))
        setUncertain(true);
      await onRefresh();
    } finally {
      setBusy(false);
    }
  };
  return (
    <form
      onSubmit={submit}
      noValidate
      aria-label={item ? 'Editar horario semanal' : 'Crear horario semanal'}
      className="mt-4 space-y-4 rounded-2xl border border-primary/40 bg-card p-5"
    >
      <h3 className="text-xl font-semibold">
        {item ? `Editar ${days[item.dayOfWeek - 1]}` : 'Crear horario semanal'}
      </h3>
      {item ? (
        <p className="text-sm">El día semanal no cambia al editar.</p>
      ) : (
        <Field label="Día de la semana" htmlFor="schedule-day" error={errors.dayOfWeek}>
          <select
            id="schedule-day"
            className={inputClass}
            value={day}
            disabled={busy || uncertain}
            onChange={(e) => setDay(Number(e.target.value))}
          >
            {days.map((name, index) => (
              <option key={name} value={index + 1} disabled={usedDays.includes(index + 1)}>
                {name}
              </option>
            ))}
          </select>
        </Field>
      )}
      <TimeFields
        open={open}
        close={close}
        setOpen={(value) => {
          setOpen(value);
          resetConfirm();
        }}
        setClose={(value) => {
          setClose(value);
          resetConfirm();
        }}
        disabled={busy || uncertain}
        errors={errors}
        prefix="weekly"
      />
      <Field
        label="Intervalo entre turnos (minutos)"
        htmlFor="schedule-interval"
        error={errors.reservationIntervalMinutes}
        hint="Entero entre 15 y 120. No es la duración de la reserva."
      >
        <input
          id="schedule-interval"
          className={inputClass}
          type="number"
          min={15}
          max={120}
          step={1}
          value={interval}
          disabled={busy || uncertain}
          onChange={(e) => {
            setInterval(e.target.value);
            resetConfirm();
          }}
          aria-invalid={!!errors.reservationIntervalMinutes}
        />
      </Field>
      <label className="flex items-center gap-3 text-sm font-medium">
        <input
          type="checkbox"
          checked={active}
          disabled={busy || uncertain}
          onChange={(e) => {
            setActive(e.target.checked);
            resetConfirm();
          }}
        />
        Servicio semanal activo
      </label>
      {confirm && (
        <Notice tone="warning" title="Confirmá la desactivación del servicio">
          Ese día dejará de iniciar servicio semanal. Las excepciones por fecha siguen teniendo
          prioridad.
        </Notice>
      )}
      <FormResult error={error} uncertain={uncertain} noun="el horario" />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={busy} disabled={!changed || uncertain}>
          {confirm ? 'Confirmar desactivación del servicio' : 'Guardar horario'}
        </Button>
        <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
          {uncertain ? 'Cerrar y revisar horarios' : 'Cancelar edición'}
        </Button>
      </div>
    </form>
  );
}

function ExceptionForm({
  root,
  item,
  onClose,
  onRefresh,
  onSaved,
}: FormActions & { item: Exception | null }) {
  const [date, setDate] = useState(item?.date ?? restaurantDate()),
    [closed, setClosed] = useState(item?.isClosed ?? false),
    [open, setOpen] = useState(item ? (item.openingTime ?? '') : '12:00'),
    [close, setClose] = useState(item ? (item.closingTime ?? '') : '23:00'),
    [reason, setReason] = useState(item?.reason ?? '');
  const [busy, setBusy] = useState(false),
    [confirm, setConfirm] = useState(false),
    [uncertain, setUncertain] = useState(false),
    [error, setError] = useState(''),
    [errors, setErrors] = useState<Record<string, string>>({});
  const changed =
    !item ||
    closed !== item.isClosed ||
    reason.trim() !== (item.reason ?? '') ||
    (!closed && (open !== item.openingTime || close !== item.closingTime));
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || uncertain || !changed) return;
    setError('');
    setErrors({});
    const complete = CreateBranchScheduleExceptionSchema.safeParse({
      date,
      isClosed: closed,
      ...(!closed ? { openingTime: open, closingTime: close } : {}),
      reason: reason.trim(),
    });
    if (!complete.success) {
      setErrors(
        Object.fromEntries(
          complete.error.issues.map((issue) => [
            String(issue.path[0]),
            issue.path[0] === 'openingTime' && !open
              ? 'Ingresá la hora de apertura.'
              : issue.path[0] === 'closingTime' && !close
                ? 'Ingresá la hora de cierre.'
                : issue.message,
          ]),
        ),
      );
      return;
    }
    if (closed && (!item || !item.isClosed) && !confirm) {
      setConfirm(true);
      return;
    }
    const body = item
      ? UpdateBranchScheduleExceptionSchema.parse({
          ...(closed !== item.isClosed ? { isClosed: closed } : {}),
          ...(!closed && (item.isClosed || open !== item.openingTime) ? { openingTime: open } : {}),
          ...(!closed && (item.isClosed || close !== item.closingTime)
            ? { closingTime: close }
            : {}),
          ...(reason.trim() !== (item.reason ?? '') ? { reason: reason.trim() } : {}),
        })
      : complete.data;
    setBusy(true);
    try {
      await (item
        ? api(
            `${root}/schedule-exceptions/${item.id}`,
            { method: 'PATCH', body: JSON.stringify(body) },
            true,
          )
        : post(`${root}/schedule-exceptions`, body, true));
      await onSaved();
    } catch (err) {
      setError(errorMessage(err));
      if (!item && err instanceof ApiError && (err.status === 0 || err.status >= 500))
        setUncertain(true);
      await onRefresh();
    } finally {
      setBusy(false);
    }
  };
  return (
    <form
      onSubmit={submit}
      noValidate
      aria-label={item ? 'Editar excepción' : 'Crear excepción'}
      className="mt-4 space-y-4 rounded-2xl border border-primary/40 bg-card p-5"
    >
      <h3 className="text-xl font-semibold">
        {item ? `Editar excepción ${item.date}` : 'Crear excepción'}
      </h3>
      {item ? (
        <p className="text-sm">La fecha de inicio del servicio no cambia al editar.</p>
      ) : (
        <Field label="Fecha de la excepción" htmlFor="exception-date" error={errors.date}>
          <input
            id="exception-date"
            className={inputClass}
            type="date"
            value={date}
            disabled={busy || uncertain}
            onChange={(e) => {
              setDate(e.target.value);
              setConfirm(false);
            }}
          />
        </Field>
      )}
      <label className="flex items-center gap-3 text-sm font-medium">
        <input
          type="checkbox"
          checked={closed}
          disabled={busy || uncertain}
          onChange={(e) => {
            setClosed(e.target.checked);
            setConfirm(false);
          }}
        />
        No inicia servicio en esta fecha
      </label>
      {!closed && (
        <TimeFields
          prefix="exception"
          open={open}
          close={close}
          setOpen={(value) => {
            setOpen(value);
            setConfirm(false);
          }}
          setClose={(value) => {
            setClose(value);
            setConfirm(false);
          }}
          disabled={busy || uncertain}
          errors={errors}
        />
      )}
      <p className="text-sm text-muted-foreground">
        Usa el intervalo del horario semanal activo de ese día, o 30 minutos si no existe. No corta
        el servicio nocturno iniciado el día anterior.
      </p>
      <Field label="Motivo interno (opcional)" htmlFor="exception-reason" error={errors.reason}>
        <input
          id="exception-reason"
          className={inputClass}
          maxLength={500}
          value={reason}
          disabled={busy || uncertain}
          onChange={(e) => {
            setReason(e.target.value);
            setConfirm(false);
          }}
        />
      </Field>
      {confirm && (
        <Notice tone="warning" title="Confirmá el cierre del servicio">
          La fecha dejará de iniciar servicio. La API rechazará el cambio si afecta reservas
          vigentes.
        </Notice>
      )}
      <FormResult error={error} uncertain={uncertain} noun="la excepción" />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={busy} disabled={!changed || uncertain}>
          {confirm ? 'Confirmar cierre del servicio' : 'Guardar excepción'}
        </Button>
        <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
          {uncertain ? 'Cerrar y revisar excepciones' : 'Cancelar edición'}
        </Button>
      </div>
    </form>
  );
}

function TimeFields({
  open,
  close,
  setOpen,
  setClose,
  disabled,
  errors,
  prefix,
}: {
  open: string;
  close: string;
  setOpen: (value: string) => void;
  setClose: (value: string) => void;
  disabled: boolean;
  errors: Record<string, string>;
  prefix: string;
}) {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Hora de apertura" htmlFor={`${prefix}-open`} error={errors.openingTime}>
          <input
            id={`${prefix}-open`}
            className={inputClass}
            type="time"
            step={60}
            value={open}
            disabled={disabled}
            aria-invalid={!!errors.openingTime}
            onChange={(e) => setOpen(e.target.value)}
          />
        </Field>
        <Field label="Hora de cierre" htmlFor={`${prefix}-close`} error={errors.closingTime}>
          <input
            id={`${prefix}-close`}
            className={inputClass}
            type="time"
            step={60}
            value={close}
            disabled={disabled}
            aria-invalid={!!errors.closingTime}
            onChange={(e) => setClose(e.target.value)}
          />
        </Field>
      </div>
      <p className="text-sm text-muted-foreground">
        {windowLabel(open, close)}. Cada reserva dura{' '}
        {BUSINESS_CONFIG.reservation.defaultDurationMinutes} minutos; un servicio más corto puede no
        ofrecer turnos.
      </p>
    </>
  );
}
function FormResult({
  error,
  uncertain,
  noun,
}: {
  error: string;
  uncertain: boolean;
  noun: string;
}) {
  return (
    <>
      {error && <Notice tone="error">{error}</Notice>}
      {uncertain && (
        <Notice tone="warning" title="No pudimos confirmar el alta">
          Cerrá y revisá {noun} antes de repetir. No reenviamos el alta automáticamente.
        </Notice>
      )}
    </>
  );
}
function RemoveHours({
  root,
  kind,
  id,
  onClose,
  onRefresh,
  onSaved,
}: FormActions & { kind: 'weekly' | 'exception'; id: string }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  return (
    <div
      className="mt-4 space-y-3 rounded-2xl border border-border bg-card p-5"
      role="group"
      aria-label="Confirmar eliminación"
    >
      <Notice
        tone="warning"
        title={kind === 'weekly' ? '¿Eliminás este horario semanal?' : '¿Eliminás esta excepción?'}
      >
        {kind === 'weekly'
          ? 'Ese día no iniciará servicio semanal. Las excepciones existentes seguirán teniendo prioridad.'
          : 'Se restablecerá el horario semanal de esa fecha, o no habrá servicio si no existe uno activo.'}{' '}
        La API verificará reservas y solapamientos antes de guardar.
      </Notice>
      {error && <Notice tone="error">{error} Revisá el listado actualizado.</Notice>}
      <div className="flex flex-wrap gap-2">
        <Button
          variant="danger"
          loading={busy}
          onClick={async () => {
            if (busy) return;
            setBusy(true);
            setError('');
            try {
              await api(
                `${root}/${kind === 'weekly' ? 'schedules' : 'schedule-exceptions'}/${id}`,
                { method: 'DELETE' },
                true,
              );
              await onSaved();
            } catch (err) {
              setError(errorMessage(err));
              await onRefresh();
            } finally {
              setBusy(false);
            }
          }}
        >
          Confirmar eliminación
        </Button>
        <Button variant="ghost" disabled={busy} onClick={onClose}>
          Cancelar eliminación
        </Button>
      </div>
    </div>
  );
}
function ServicePreview({ branch }: { branch: Branch }) {
  const [date, setDate] = useState(restaurantDate());
  type Hours = {
    isClosed: boolean;
    source: 'WEEKLY' | 'EXCEPTION' | 'NONE';
    reservationIntervalMinutes: number;
    window: { startAt: string; endAt: string } | null;
  };
  const query = useQuery({
    queryKey: ['hours', branch.id, date],
    queryFn: () => api<Hours>(`/branches/${branch.id}/hours?date=${date}`),
    enabled: branch.isActive && z.string().date().safeParse(date).success,
    retry: false,
  });
  return (
    <section
      className="mt-8 rounded-2xl border border-border bg-card p-5"
      aria-label="Servicio efectivo"
    >
      <h2 className="text-2xl font-semibold">Consultar servicio por fecha</h2>
      {!branch.isActive ? (
        <p className="mt-3 text-sm">
          La consulta pública estará disponible al reactivar la sucursal.
        </p>
      ) : (
        <>
          <div className="mt-4">
            <Field label="Fecha a consultar" htmlFor="service-date">
              <input
                id="service-date"
                className={inputClass}
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </Field>
          </div>
          <div className="mt-4">
            {!date ? (
              <p>Elegí una fecha.</p>
            ) : query.isPending ? (
              <p>Consultando servicio…</p>
            ) : query.error ? (
              <QueryError error={query.error} retry={query.refetch} />
            ) : (
              query.data && (
                <>
                  <p className="font-semibold">
                    Origen:{' '}
                    {
                      {
                        WEEKLY: 'horario semanal',
                        EXCEPTION: 'excepción por fecha',
                        NONE: 'sin horario',
                      }[query.data.source]
                    }
                  </p>
                  {query.data.window ? (
                    <>
                      <p className="mt-2">Inicio: {formatDateTime(query.data.window.startAt)}</p>
                      <p>Fin: {formatDateTime(query.data.window.endAt)}</p>
                      <p className="mt-2 text-sm">
                        Intervalo: {query.data.reservationIntervalMinutes} minutos.
                      </p>
                    </>
                  ) : (
                    <p className="mt-2">No inicia servicio en esta fecha.</p>
                  )}
                  <p className="mt-2 text-xs text-muted-foreground">
                    Resultado de la API en la zona del restaurante. No representa disponibilidad de
                    mesas ni recorta el servicio del día anterior.
                  </p>
                </>
              )
            )}
          </div>
        </>
      )}
    </section>
  );
}

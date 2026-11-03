import { createFileRoute } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BUSINESS_CONFIG } from '@repo/config';
import { api, post, errorMessage, type Page, type Reservation } from '@/lib/api';
import { useStore } from '@/lib/store';
import { restaurantDate, formatDateTime, eventLabel } from '@/lib/format';
import { Button, Container, Field, Notice, StatusBadge, inputClass } from '@/components/kit';
import {
  ManagementAccess,
  Pager,
  QueryError,
  useManagedBranches,
} from '@/components/management/common';

export const Route = createFileRoute('/personal')({
  head: () => ({
    meta: [{ title: 'Agenda del restaurante — App Resto' }, { name: 'robots', content: 'noindex' }],
  }),
  component: () => (
    <ManagementAccess>
      <Agenda />
    </ManagementAccess>
  ),
});
type StaffReservation = Reservation & {
  user: { firstName: string; lastName: string; email: string; phone: string | null };
};
function Agenda() {
  const { user } = useStore();
  const branches = useManagedBranches();
  const [selected, setSelected] = useState(''),
    [date, setDate] = useState(restaurantDate()),
    [page, setPage] = useState(1);
  const branchId = branches.data?.some((b) => b.id === selected)
    ? selected
    : (branches.data?.[0]?.id ?? '');
  const reservations = useQuery({
    queryKey: ['management', user?.id, 'agenda', branchId, date, page],
    queryFn: () =>
      api<Page<StaffReservation>>(
        `/staff/branches/${branchId}/reservations?date=${date}&page=${page}&limit=10`,
        {},
        true,
      ),
    enabled: !!branchId && /^\d{4}-\d{2}-\d{2}$/.test(date),
    retry: false,
    refetchInterval: 30000,
  });
  return (
    <Container className="max-w-3xl py-10">
      <h1 className="text-3xl font-semibold">Agenda del restaurante</h1>
      <p className="mt-2 text-muted-foreground">
        Reservas por fecha de inicio del servicio. Horarios de {BUSINESS_CONFIG.timezone}.
      </p>
      {branches.isPending ? (
        <p className="mt-6">Cargando sucursales…</p>
      ) : branches.error ? (
        <QueryError error={branches.error} retry={branches.refetch} />
      ) : !branches.data?.length ? (
        <div className="mt-6">
          <Notice title="No tenés sucursales activas asignadas">
            Pedile a un administrador que revise tu asignación.
          </Notice>
        </div>
      ) : (
        <>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <Field label="Sucursal de la agenda" htmlFor="agenda-branch">
              <select
                id="agenda-branch"
                className={inputClass}
                value={branchId}
                onChange={(e) => {
                  setSelected(e.target.value);
                  setPage(1);
                }}
              >
                {branches.data.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Fecha de servicio" htmlFor="agenda-date">
              <input
                id="agenda-date"
                type="date"
                className={inputClass}
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                  setPage(1);
                }}
              />
            </Field>
          </div>
          <Button
            variant="secondary"
            className="mt-4"
            onClick={() => {
              void branches.refetch();
              void reservations.refetch();
            }}
          >
            Actualizar agenda
          </Button>
          <div className="mt-6 space-y-4">
            {!date ? (
              <Notice>Elegí una fecha para consultar.</Notice>
            ) : reservations.isPending ? (
              <p>Cargando reservas…</p>
            ) : reservations.error ? (
              <QueryError error={reservations.error} retry={reservations.refetch} />
            ) : !reservations.data?.data.length ? (
              <Notice title="No hay reservas para este servicio" />
            ) : (
              reservations.data.data.map((reservation) => (
                <AgendaCard
                  key={`${user?.id}:${reservation.id}`}
                  reservation={reservation}
                  branchId={branchId}
                />
              ))
            )}
          </div>
          {reservations.data && (
            <Pager page={page} totalPages={reservations.data.meta.totalPages} onChange={setPage} />
          )}
        </>
      )}
    </Container>
  );
}

function AgendaCard({
  reservation,
  branchId,
}: {
  reservation: StaffReservation;
  branchId: string;
}) {
  const client = useQueryClient();
  const [action, setAction] = useState<'ATTENDED' | 'NO_SHOW' | 'CANCEL' | null>(null),
    [reason, setReason] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [success, setSuccess] = useState('');
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(timer);
  }, []);
  const start = Date.parse(reservation.startAt),
    confirmed = reservation.status === 'CONFIRMED';
  const submit = async () => {
    if (!action || busy) return;
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const root = `/staff/branches/${branchId}/reservations/${reservation.id}`;
      await post(
        action === 'CANCEL' ? `${root}/cancel` : `${root}/attendance`,
        action === 'CANCEL'
          ? { reason: reason.trim() }
          : { outcome: action, ...(reason.trim() ? { reason: reason.trim() } : {}) },
        true,
      );
      setSuccess(action === 'CANCEL' ? 'Reserva cancelada.' : 'Resultado y puntos registrados.');
      setAction(null);
      setReason('');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      await client.invalidateQueries({ queryKey: ['management'] });
      await client.invalidateQueries({ queryKey: ['loyalty'] });
      setBusy(false);
    }
  };
  return (
    <article className="rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">
          {reservation.user.firstName} {reservation.user.lastName}
        </h2>
        <StatusBadge status={reservation.status} />
      </div>
      <p className="mt-2">
        {formatDateTime(reservation.startAt)} · {reservation.partySize} personas · Mesa{' '}
        {reservation.table.tableNumber}
      </p>
      <p className="mt-2 break-words text-sm text-muted-foreground">
        {reservation.user.email}
        {reservation.user.phone ? ` · ${reservation.user.phone}` : ''}
      </p>
      {success && (
        <div className="mt-3">
          <Notice tone="success">{success}</Notice>
        </div>
      )}
      {confirmed && (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={busy || now < start}
            onClick={() => {
              setAction('ATTENDED');
              setError('');
            }}
          >
            Registrar asistencia
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={
              busy || now < start + BUSINESS_CONFIG.attendance.noShowGracePeriodMinutes * 60000
            }
            onClick={() => {
              setAction('NO_SHOW');
              setError('');
            }}
          >
            Registrar ausencia
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={busy || now >= start}
            onClick={() => {
              setAction('CANCEL');
              setError('');
            }}
          >
            Cancelar reserva
          </Button>
        </div>
      )}
      {confirmed && (
        <p className="mt-3 text-xs text-muted-foreground">
          Asistencia desde el inicio (+{BUSINESS_CONFIG.loyalty.attendanceReward} punto). Ausencia
          después de {BUSINESS_CONFIG.attendance.noShowGracePeriodMinutes} minutos (−
          {BUSINESS_CONFIG.loyalty.noShowPenalty}, mínimo cero). La cancelación del restaurante se
          permite antes del inicio.
        </p>
      )}
      {action && confirmed && (
        <div className="mt-4 space-y-3 rounded-xl border border-border p-4">
          <p className="font-semibold">
            {action === 'ATTENDED'
              ? '¿Confirmás que el cliente asistió?'
              : action === 'NO_SHOW'
                ? '¿Confirmás que el cliente no se presentó?'
                : '¿Confirmás la cancelación del restaurante?'}
          </p>
          <p className="text-sm">
            El resultado de asistencia es definitivo. Comprobá la reserva antes de confirmar.
          </p>
          <Field
            label={action === 'CANCEL' ? 'Motivo obligatorio' : 'Motivo (opcional)'}
            htmlFor={`reason-${reservation.id}`}
          >
            <input
              id={`reason-${reservation.id}`}
              className={inputClass}
              value={reason}
              disabled={busy}
              maxLength={500}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
          {error && (
            <Notice tone="error">
              {error} Actualizamos la agenda para comprobar el estado de la reserva.
            </Notice>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              loading={busy}
              disabled={
                action === 'CANCEL'
                  ? reason.trim().length < 3
                  : !!reason.trim() && reason.trim().length < 3
              }
              onClick={() => void submit()}
            >
              Confirmar resultado
            </Button>
            <Button variant="ghost" disabled={busy} onClick={() => setAction(null)}>
              Volver
            </Button>
          </div>
        </div>
      )}
      <details className="mt-4 text-sm">
        <summary className="cursor-pointer font-medium">Ver historial</summary>
        <p className="mt-2 break-all text-xs">Referencia: {reservation.id}</p>
        <ol className="mt-3 space-y-2">
          {reservation.events.map((event) => (
            <li key={event.id}>
              {eventLabel(event.type)} · {formatDateTime(event.createdAt)}
              {event.reason ? ` · ${event.reason}` : ''}
            </li>
          ))}
        </ol>
      </details>
    </article>
  );
}

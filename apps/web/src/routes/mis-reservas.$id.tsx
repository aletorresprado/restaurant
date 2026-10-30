import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import {
  Button,
  Container,
  Notice,
  Skeleton,
  StatusBadge,
  buttonVariants,
  inputClass,
} from '@/components/kit';
import { ReservationSummary } from '@/components/ReservationSummary';
import { useReservation } from '@/lib/reservations';
import { useStore } from '@/lib/store';
import { errorMessage, post, type Reservation } from '@/lib/api';
import { canCancel, cancelDeadline, eventLabel, formatDateTime } from '@/lib/format';
import { cancellationPolicy } from '@/lib/presentation';
export const Route = createFileRoute('/mis-reservas/$id')({
  head: () => ({
    meta: [{ title: 'Detalle de reserva — App Resto' }, { name: 'robots', content: 'noindex' }],
  }),
  component: Detail,
});
function Detail() {
  const { id } = Route.useParams();
  const { user, ready } = useStore();
  const query = useReservation(id);
  const client = useQueryClient();
  const [dialog, setDialog] = useState(false),
    [cancelling, setCancelling] = useState(false),
    [done, setDone] = useState(false);
  const [reason, setReason] = useState(''),
    [error, setError] = useState('');
  const reference = useRef<HTMLDialogElement>(null);
  const [, clock] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => clock((v) => v + 1), 30000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (dialog) reference.current?.showModal();
    else reference.current?.close();
  }, [dialog]);
  const cancel = async () => {
    if (cancelling) return;
    setCancelling(true);
    setError('');
    try {
      const reservation = await post<Reservation>(
        `/reservations/${id}/cancel`,
        reason.trim() ? { reason: reason.trim() } : {},
        true,
      );
      client.setQueryData(['reservation', user?.id, id], reservation);
      void client.invalidateQueries({ queryKey: ['reservations'] });
      setDone(true);
      setDialog(false);
    } catch (error) {
      setError(errorMessage(error));
      void query.refetch();
    } finally {
      setCancelling(false);
    }
  };
  if (!ready || (user && query.isPending))
    return (
      <Container className="max-w-xl py-12">
        <Skeleton className="h-96" />
      </Container>
    );
  if (!user)
    return (
      <Container className="max-w-xl py-12">
        <Notice
          title="Ingresá para ver tu reserva"
          action={
            <Link
              to="/ingresar"
              search={{ continuar: 'mis-reservas' }}
              className={buttonVariants()}
            >
              Ingresar
            </Link>
          }
        />
      </Container>
    );
  if (query.error || !query.data)
    return (
      <Container className="max-w-xl py-12">
        <Notice
          tone="error"
          title="No pudimos cargar esta reserva"
          action={
            <Button
              onClick={() => {
                void query.refetch();
              }}
            >
              Reintentar
            </Button>
          }
        >
          {query.error?.message}
        </Notice>
      </Container>
    );
  const reservation = query.data;
  return (
    <Container className="max-w-xl py-8">
      <Link
        to="/mis-reservas"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground"
      >
        <ArrowLeft className="size-4" />
        Mis reservas
      </Link>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-3xl font-semibold">Tu reserva</h1>
        <StatusBadge status={reservation.status} />
      </div>
      <p className="mt-2 break-all text-xs text-muted-foreground">Referencia: {reservation.id}</p>
      <div className="mt-6 space-y-5">
        {done && (
          <Notice tone="success" title="Cancelaste la reserva">
            Liberamos la mesa. Podés hacer una nueva reserva cuando quieras.
          </Notice>
        )}
        <ReservationSummary {...reservation} />
        {reservation.status === 'CONFIRMED' &&
          (canCancel(reservation.startAt) ? (
            <section className="rounded-xl border border-border p-4 text-sm">
              <p>{cancellationPolicy}</p>
              <p className="mt-2 font-medium">
                Podés cancelar hasta el {formatDateTime(cancelDeadline(reservation.startAt))}.
              </p>
              <Button
                variant="secondary"
                className="mt-3 text-destructive"
                onClick={() => {
                  setError('');
                  setDialog(true);
                }}
              >
                Cancelar reserva
              </Button>
            </section>
          ) : (
            <Notice tone="warning" title="El plazo de cancelación desde la app terminó">
              Si no podés asistir, comunicate con la sucursal. La reserva conserva el estado que
              muestra el sistema.
            </Notice>
          ))}
        <section>
          <h2 className="font-sans text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Historial
          </h2>
          <ol className="mt-3 space-y-3 border-l border-border pl-4">
            {reservation.events.map((event) => (
              <li key={event.id} className="relative text-sm">
                <span className="absolute -left-[21px] top-1.5 size-2.5 rounded-full bg-primary" />
                <p className="font-medium">{eventLabel(event.type)}</p>
                <p className="text-muted-foreground">
                  {formatDateTime(event.createdAt)}
                  {event.reason ? ` · ${event.reason}` : ''}
                </p>
              </li>
            ))}
          </ol>
        </section>
      </div>
      <dialog
        ref={reference}
        aria-labelledby="cancel-title"
        onCancel={(event) => {
          if (cancelling) event.preventDefault();
        }}
        onClose={() => setDialog(false)}
        className="m-auto w-[min(92vw,420px)] rounded-2xl bg-card p-6 text-foreground backdrop:bg-overlay"
      >
        <h2 id="cancel-title" className="text-xl font-semibold">
          ¿Cancelás la reserva?
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          {reservation.branch.name} · {formatDateTime(reservation.startAt)}. Esta acción no se puede
          deshacer.
        </p>
        <label htmlFor="reason" className="mt-4 block text-sm font-medium">
          Motivo (opcional)
        </label>
        <input
          id="reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          maxLength={500}
          className={`${inputClass} mt-2`}
          disabled={cancelling}
        />
        {error && (
          <div className="mt-3">
            <Notice tone="error">{error}</Notice>
          </div>
        )}
        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="ghost" onClick={() => setDialog(false)} disabled={cancelling}>
            Mantener reserva
          </Button>
          <Button
            variant="danger"
            onClick={cancel}
            loading={cancelling}
            disabled={!!reason.trim() && reason.trim().length < 3}
          >
            {cancelling ? 'Cancelando…' : 'Sí, cancelar'}
          </Button>
        </div>
      </dialog>
    </Container>
  );
}

import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Container, Notice, Skeleton, Stepper, buttonVariants } from '@/components/kit';
import { ReservationSummary } from '@/components/ReservationSummary';
import { useStore } from '@/lib/store';
import { ApiError, errorMessage, post, getSessionIdentity, type Reservation } from '@/lib/api';
import {
  useReservationIntent,
  prepareReservation,
  finishReservation,
  sameSelection,
  type ReservationIntent,
} from '@/lib/reservation-intent';
import { cancelDeadline, formatDateTime } from '@/lib/format';
import { cancellationPolicy } from '@/lib/presentation';
export const Route = createFileRoute('/confirmar')({
  head: () => ({ meta: [{ title: 'Confirmá tu reserva — App Resto' }] }),
  component: Confirm,
});
function Confirm() {
  const { user, ready, pending: selected, setPending } = useStore();
  const { intent, error: storageError } = useReservationIntent(user?.id);
  const pending = intent && !intent.reservationId ? intent.selection : selected;
  const navigate = useNavigate();
  const client = useQueryClient();
  const [state, setState] = useState<'idle' | 'sending' | 'sold-out' | 'uncertain'>('idle');
  const [error, setError] = useState('');
  const sending = useRef(false);
  useEffect(() => {
    if (ready && pending && !user)
      void navigate({ to: '/ingresar', search: { continuar: 'confirmar' } });
  }, [ready, pending, user, navigate]);
  if (!ready)
    return (
      <Container className="max-w-xl py-12">
        <Skeleton className="h-96" />
      </Container>
    );
  if (intent?.reservationId && (!selected || sameSelection(intent.selection, selected)))
    return (
      <Container className="max-w-xl py-16 text-center">
        <h1 className="text-2xl">Esta reserva ya fue registrada</h1>
        <p className="mt-3">
          Consultá su estado actual. No creamos otra reserva al recuperar este intento.
        </p>
        <Link
          to="/mis-reservas/$id"
          params={{ id: intent.reservationId }}
          className={buttonVariants({ className: 'mt-6' })}
        >
          Ver reserva
        </Link>
      </Container>
    );
  if (!pending)
    return (
      <Container className="max-w-xl py-16 text-center">
        <h1 className="text-2xl">No hay un horario elegido</h1>
        <Link to="/" className={buttonVariants({ className: 'mt-6' })}>
          Elegí sucursal
        </Link>
      </Container>
    );
  const confirm = async () => {
    if (sending.current || !user || (state !== 'idle' && state !== 'uncertain')) return;
    const identity = getSessionIdentity();
    let attempt: ReservationIntent | undefined;
    let posted = false;
    sending.current = true;
    setState('sending');
    setError('');
    try {
      attempt = await prepareReservation(user.id, pending);
      if (getSessionIdentity() !== identity)
        throw new ApiError(401, 'La sesión cambió. Ingresá con la cuenta del intento original.');
      if (attempt.reservationId) {
        await navigate({ to: '/mis-reservas/$id', params: { id: attempt.reservationId } });
        return;
      }
      setPending(attempt.selection);
      const { endAt: _, ...body } = attempt.selection;
      posted = true;
      const reservation = await post<Reservation>(
        '/reservations',
        { ...body, operationId: attempt.operationId },
        true,
      );
      await finishReservation(user.id, attempt.operationId, reservation.id);
      if (getSessionIdentity() !== identity)
        throw new ApiError(0, 'La sesión cambió. Consultá el resultado con la cuenta original.');
      client.setQueryData(['reservation', user.id, reservation.id], reservation);
      void client.invalidateQueries({ queryKey: ['reservations'] });
      setPending(null);
      await navigate({
        to: reservation.status === 'CONFIRMED' ? '/confirmada/$id' : '/mis-reservas/$id',
        params: { id: reservation.id },
      });
    } catch (error) {
      setError(errorMessage(error));
      if (!posted) setState('idle');
      else if (error instanceof ApiError && [400, 404, 409].includes(error.status)) {
        if (attempt) await finishReservation(user.id, attempt.operationId).catch(() => {});
        setState('sold-out');
      } else if (!(error instanceof ApiError) || error.status === 0 || error.status >= 500)
        setState('uncertain');
      else setState('idle');
    } finally {
      sending.current = false;
    }
  };
  return (
    <Container className="max-w-xl py-10">
      <Stepper current={2} />
      <h1 className="mt-6 text-3xl font-semibold">Revisá y confirmá</h1>
      <p className="mt-2 text-muted-foreground">
        A nombre de {user?.firstName} {user?.lastName}.
      </p>
      <div className="mt-6 space-y-5">
        {storageError && (
          <Notice tone="error" title="No podemos proteger la confirmación">
            {storageError}
          </Notice>
        )}
        {intent && !intent.reservationId && state !== 'sending' && (
          <Notice title="Tenés una confirmación por verificar">
            Conservamos el intento original. Verificar y reintentar recupera la misma reserva si ya
            fue registrada, sin crear otra.
          </Notice>
        )}
        {error && (
          <Notice
            tone="error"
            title={
              state === 'uncertain'
                ? 'No sabemos si la reserva llegó a confirmarse'
                : state === 'sold-out'
                  ? 'No pudimos confirmar este horario'
                  : 'No pudimos confirmar'
            }
          >
            {error}
            {state === 'uncertain' && (
              <p className="mt-2">
                Podés verificar y reintentar este mismo intento cuando recuperes la conexión.
                También podés consultar Mis reservas. No se reenvía automáticamente.
              </p>
            )}
          </Notice>
        )}
        {user && user.role !== 'CUSTOMER' && (
          <Notice tone="warning" title="Usá una cuenta de cliente para reservar">
            Esta cuenta es de personal o administración. Podés cerrar sesión e ingresar con tu
            cuenta de cliente.
          </Notice>
        )}
        <ReservationSummary {...pending} />
        <section className="rounded-xl border border-accent/30 bg-accent-soft p-4 text-sm">
          <h2 className="font-sans font-semibold">Política de cancelación</h2>
          <p className="mt-1">{cancellationPolicy}</p>
          <p className="mt-2 font-medium">
            Podés cancelar hasta el {formatDateTime(cancelDeadline(pending.startAt))}.
          </p>
        </section>
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
          {!intent || intent.reservationId ? (
            <Link
              to="/reservar"
              search={{
                sucursal: pending.branchId,
                fecha: pending.serviceDate,
                personas: pending.partySize,
              }}
              className={buttonVariants({ variant: 'ghost' })}
            >
              Cambiar horario
            </Link>
          ) : (
            <Link to="/mis-reservas" className={buttonVariants()}>
              Revisar Mis reservas
            </Link>
          )}
          <Button
            size="lg"
            loading={state === 'sending'}
            disabled={
              !user ||
              user.role !== 'CUSTOMER' ||
              !!storageError ||
              (state !== 'idle' && state !== 'uncertain')
            }
            onClick={confirm}
          >
            {state === 'sending'
              ? 'Confirmando reserva…'
              : intent && !intent.reservationId
                ? 'Verificar y reintentar'
                : 'Confirmá la reserva'}
          </Button>
        </div>
      </div>
    </Container>
  );
}

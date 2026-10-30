import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Button, Container, Notice, Skeleton, Stepper, buttonVariants } from '@/components/kit';
import { ReservationSummary } from '@/components/ReservationSummary';
import { useStore } from '@/lib/store';
import { ApiError, errorMessage, post, type Reservation } from '@/lib/api';
import { cancelDeadline, formatDateTime } from '@/lib/format';
import { cancellationPolicy } from '@/lib/presentation';
export const Route = createFileRoute('/confirmar')({
  head: () => ({ meta: [{ title: 'Confirmá tu reserva — App Resto' }] }),
  component: Confirm,
});
function Confirm() {
  const { user, ready, pending, setPending } = useStore();
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
    if (sending.current || !user || state !== 'idle') return;
    sending.current = true;
    setState('sending');
    setError('');
    try {
      const { endAt: _, ...body } = pending;
      const reservation = await post<Reservation>('/reservations', body, true);
      client.setQueryData(['reservation', user.id, reservation.id], reservation);
      void client.invalidateQueries({ queryKey: ['reservations'] });
      setPending(null);
      await navigate({ to: '/confirmada/$id', params: { id: reservation.id } });
    } catch (error) {
      setError(errorMessage(error));
      if (error instanceof ApiError && error.status === 409) setState('sold-out');
      else if (!(error instanceof ApiError) || error.status === 0 || error.status >= 500)
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
        {error && (
          <Notice
            tone="error"
            title={
              state === 'uncertain'
                ? 'No sabemos si la reserva llegó a confirmarse'
                : state === 'sold-out'
                  ? 'Ese turno ya no tiene disponibilidad'
                  : 'No pudimos confirmar'
            }
          >
            {error}
            {state === 'uncertain' && (
              <p className="mt-2">
                Revisá Mis reservas antes de volver a reservar. No repetiremos automáticamente la
                solicitud.
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
          {state !== 'uncertain' ? (
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
            disabled={!user || user.role !== 'CUSTOMER' || state !== 'idle'}
            onClick={confirm}
          >
            {state === 'sending' ? 'Confirmando reserva…' : 'Confirmá la reserva'}
          </Button>
        </div>
      </div>
    </Container>
  );
}

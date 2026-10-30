import { createFileRoute, Link } from '@tanstack/react-router';
import { CheckCircle2, MapPin } from 'lucide-react';
import { Container, Notice, Skeleton, StatusBadge, buttonVariants } from '@/components/kit';
import { ReservationSummary } from '@/components/ReservationSummary';
import { useReservation } from '@/lib/reservations';
import { useStore } from '@/lib/store';
export const Route = createFileRoute('/confirmada/$id')({
  head: () => ({
    meta: [{ title: 'Tu reserva — App Resto' }, { name: 'robots', content: 'noindex' }],
  }),
  component: Confirmed,
});
function Confirmed() {
  const { id } = Route.useParams();
  const { user, ready } = useStore();
  const query = useReservation(id);
  if (!ready || (user && query.isPending))
    return (
      <Container className="max-w-xl py-10">
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
        <Notice tone="error" title="No pudimos consultar esta reserva">
          {query.error?.message}
        </Notice>
        <Link to="/mis-reservas" className={buttonVariants({ className: 'mt-6' })}>
          Mis reservas
        </Link>
      </Container>
    );
  const reservation = query.data;
  return (
    <Container className="max-w-xl py-10">
      <div className="text-center">
        <CheckCircle2 className="mx-auto size-14 text-success" />
        <h1 className="mt-4 text-3xl font-semibold">
          {reservation.status === 'CONFIRMED'
            ? '¡Listo, tu mesa está reservada!'
            : 'Consultá el estado de tu reserva'}
        </h1>
        <div className="mt-3">
          <StatusBadge status={reservation.status} />
        </div>
        <p className="mt-3 break-all text-sm text-muted-foreground">Referencia: {reservation.id}</p>
      </div>
      <div className="mt-8 space-y-5">
        <ReservationSummary {...reservation} />
        <section className="rounded-xl bg-secondary p-5 text-sm">
          <h2 className="font-sans font-semibold">Dónde te esperamos</h2>
          <p className="mt-2 flex gap-2">
            <MapPin className="size-4 shrink-0" />
            {reservation.branch.address}
          </p>
        </section>
        <div className="flex flex-col gap-3 sm:flex-row">
          <Link
            to="/mis-reservas/$id"
            params={{ id }}
            className={buttonVariants({ className: 'flex-1' })}
          >
            Ver detalle
          </Link>
          <Link
            to="/mis-reservas"
            className={buttonVariants({ variant: 'secondary', className: 'flex-1' })}
          >
            Mis reservas
          </Link>
        </div>
      </div>
    </Container>
  );
}

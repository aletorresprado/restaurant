import { createFileRoute, Link } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronRight, Users } from 'lucide-react';
import { Button, Container, Notice, Skeleton, StatusBadge, buttonVariants } from '@/components/kit';
import { useStore } from '@/lib/store';
import { reservationPage } from '@/lib/reservations';
import { formatDateTime } from '@/lib/format';
import { hero } from '@/lib/presentation';
export const Route = createFileRoute('/mis-reservas/')({
  head: () => ({ meta: [{ title: 'Mis reservas — App Resto' }] }),
  component: Reservations,
});
function Reservations() {
  const { user, ready } = useStore();
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [user?.id]);
  const query = useQuery({
    queryKey: ['reservations', user?.id, page],
    queryFn: () => reservationPage(page),
    enabled: ready && !!user,
    retry: false,
    staleTime: 0,
  });
  if (!ready)
    return (
      <Container className="max-w-2xl py-12">
        <Skeleton className="h-72" />
      </Container>
    );
  if (!user)
    return (
      <Container className="max-w-md py-16 text-center">
        <h1 className="text-3xl">Mis reservas</h1>
        <p className="mt-2 text-muted-foreground">Ingresá para ver y gestionar tus reservas.</p>
        <Link
          to="/ingresar"
          search={{ continuar: 'mis-reservas' }}
          className={buttonVariants({ className: 'mt-6' })}
        >
          Ingresar
        </Link>
      </Container>
    );
  return (
    <Container className="max-w-2xl py-10">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-3xl font-semibold">Mis reservas</h1>
        <Link to="/" className={buttonVariants({ size: 'sm' })}>
          Nueva reserva
        </Link>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        Tus reservas en orden de fecha, incluidas las anteriores y canceladas.
      </p>
      {query.isPending ? (
        <div className="mt-6 space-y-3">
          <Skeleton className="h-24" />
          <Skeleton className="h-24" />
        </div>
      ) : query.error ? (
        <div className="mt-6">
          <Notice
            tone="error"
            title="No pudimos consultar tus reservas"
            action={
              <Button
                variant="secondary"
                onClick={() => {
                  void query.refetch();
                }}
              >
                Reintentar
              </Button>
            }
          >
            {query.error.message}
          </Notice>
        </div>
      ) : !query.data?.data.length ? (
        <div className="mt-10 rounded-2xl border border-dashed border-border p-10 text-center">
          <p className="font-medium">Todavía no tenés reservas.</p>
          <Link to="/" className={buttonVariants({ className: 'mt-4' })}>
            Reservá una mesa
          </Link>
        </div>
      ) : (
        <>
          <ul className="mt-6 space-y-3">
            {query.data.data.map((reservation) => (
              <li key={reservation.id}>
                <Link
                  to="/mis-reservas/$id"
                  params={{ id: reservation.id }}
                  className="flex items-center gap-4 rounded-2xl border border-border bg-card p-3 pr-4 transition hover:border-primary/50"
                >
                  <img src={hero} alt="" className="size-16 rounded-xl object-cover sm:size-20" />
                  <div className="min-w-0 flex-1">
                    <StatusBadge status={reservation.status} />
                    <p className="mt-1.5 font-semibold">{formatDateTime(reservation.startAt)}</p>
                    <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                      {reservation.branch.name} · <Users className="size-3.5" />
                      {reservation.partySize}
                    </p>
                  </div>
                  <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-6 flex items-center justify-between gap-3">
            <Button
              variant="secondary"
              size="sm"
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Anterior
            </Button>
            <p className="text-sm text-muted-foreground">
              Página {page} de {query.data.meta.totalPages}
            </p>
            <Button
              variant="secondary"
              size="sm"
              disabled={page >= query.data.meta.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Siguiente
            </Button>
          </div>
        </>
      )}
    </Container>
  );
}

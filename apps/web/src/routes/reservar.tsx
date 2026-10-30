import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight } from 'lucide-react';
import { AvailabilityQuerySchema } from '@repo/validation';
import { BUSINESS_CONFIG } from '@repo/config';
import {
  Button,
  Container,
  Notice,
  Skeleton,
  Stepper,
  buttonVariants,
  inputClass,
} from '@/components/kit';
import { api, type Slot } from '@/lib/api';
import { useStore } from '@/lib/store';
import { dateLabel, formatDateTime, hhmm, restaurantDate } from '@/lib/format';
import { cn } from '@/lib/utils';

export const Route = createFileRoute('/reservar')({
  validateSearch: (
    value: Record<string, unknown>,
  ): { sucursal?: string; fecha?: string; personas?: number } => ({
    sucursal: typeof value.sucursal === 'string' ? value.sucursal : undefined,
    fecha: AvailabilityQuerySchema.shape.date.safeParse(value.fecha).success
      ? (value.fecha as string)
      : undefined,
    personas: AvailabilityQuerySchema.shape.partySize.safeParse(value.personas).success
      ? Number(value.personas)
      : undefined,
  }),
  head: () => ({ meta: [{ title: 'Consultá disponibilidad — App Resto' }] }),
  component: Reserve,
});
function Reserve() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const { branches, branchesLoading, branchesError, reloadBranches, user, pending, setPending } =
    useStore();
  const branchId = search.sucursal ?? branches[0]?.id;
  const date = search.fecha ?? restaurantDate();
  const partySize = search.personas ?? 2;
  const [selected, setSelected] = useState<Slot | null>(null);
  const branch = branches.find((b) => b.id === branchId);
  const slots = useQuery({
    queryKey: ['availability', branchId, date, partySize],
    queryFn: () =>
      api<{ slots: Slot[]; timezone: string }>(
        `/branches/${branchId}/availability?date=${date}&partySize=${partySize}`,
      ),
    enabled: !!branch,
    retry: 1,
    staleTime: 0,
  });
  const hours = useQuery({
    queryKey: ['hours', branchId, date],
    queryFn: () => api<{ isClosed: boolean }>(`/branches/${branchId}/hours?date=${date}`),
    enabled: !!branch,
    retry: 1,
  });
  useEffect(() => {
    setSelected(null);
  }, [branchId, date, partySize]);
  useEffect(() => {
    if (
      !slots.data ||
      !pending ||
      pending.branchId !== branchId ||
      pending.serviceDate !== date ||
      pending.partySize !== partySize
    )
      return;
    setSelected(slots.data.slots.find((slot) => slot.startAt === pending.startAt) ?? null);
  }, [slots.data, pending, branchId, date, partySize]);
  const update = (patch: { sucursal?: string; fecha?: string; personas?: number }) => {
    setSelected(null);
    setPending(null);
    void navigate({
      to: '/reservar',
      search: { sucursal: branchId, fecha: date, personas: partySize, ...patch },
      replace: true,
    });
  };
  const proceed = () => {
    if (!selected || !branchId) return;
    setPending({
      branchId,
      serviceDate: date,
      partySize,
      startAt: selected.startAt,
      endAt: selected.endAt,
    });
    if (user) void navigate({ to: '/confirmar' });
    else void navigate({ to: '/ingresar', search: { continuar: 'confirmar' } });
  };
  if (branchesLoading)
    return (
      <Container className="py-12">
        <Skeleton className="h-96" />
      </Container>
    );
  if (branchesError)
    return (
      <Container className="py-12">
        <Notice
          tone="error"
          title="No pudimos cargar las sucursales"
          action={<Button onClick={reloadBranches}>Reintentar</Button>}
        >
          {branchesError.message}
        </Notice>
      </Container>
    );
  if (!branch)
    return (
      <Container className="py-12">
        <Notice
          title="No encontramos una sucursal disponible"
          action={
            <Link to="/" className={buttonVariants()}>
              Elegir sucursal
            </Link>
          }
        >
          Elegí una sucursal activa para continuar.
        </Notice>
      </Container>
    );
  return (
    <Container className="pb-32 pt-8">
      <Stepper current={0} />
      <h1 className="mt-6 text-3xl font-semibold sm:text-4xl">Consultá disponibilidad</h1>
      <p className="mt-2 text-muted-foreground">
        Una mesa para tu grupo durante {BUSINESS_CONFIG.reservation.defaultDurationMinutes} minutos.
        La asignación es automática.
      </p>
      <div className="mt-8 grid gap-8 lg:grid-cols-[320px_1fr] [&>*]:min-w-0">
        <div className="space-y-6">
          <div>
            <label htmlFor="sucursal" className="mb-1.5 block text-sm font-medium">
              Sucursal
            </label>
            <select
              id="sucursal"
              className={inputClass}
              value={branchId}
              onChange={(event) => update({ sucursal: event.target.value })}
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} — {b.address}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="personas" className="mb-1.5 block text-sm font-medium">
              Cantidad de personas
            </label>
            <input
              key={partySize}
              id="personas"
              type="number"
              min={1}
              max={50}
              defaultValue={partySize}
              className={inputClass}
              onBlur={(event) => {
                const value = Number(event.target.value);
                if (Number.isInteger(value) && value >= 1 && value <= 50)
                  update({ personas: value });
                else event.target.value = String(partySize);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.currentTarget.blur();
              }}
            />
            <p className="mt-2 text-sm text-muted-foreground">
              De 1 a 50 personas, según las mesas disponibles.
            </p>
          </div>
          <div>
            <label htmlFor="fecha" className="mb-1.5 block text-sm font-medium">
              Fecha de servicio
            </label>
            <input
              id="fecha"
              type="date"
              min={restaurantDate()}
              value={date}
              className={inputClass}
              onChange={(event) => {
                if (AvailabilityQuerySchema.shape.date.safeParse(event.target.value).success)
                  update({ fecha: event.target.value });
              }}
            />
            <p className="mt-2 text-sm text-muted-foreground">
              Horarios de la sucursal, incluidos los que continúan después de medianoche.
            </p>
          </div>
        </div>
        <section aria-live="polite" aria-busy={slots.isFetching}>
          <h2 className="mb-4 text-xl font-semibold">
            {branch.name} · {dateLabel(date)}
          </h2>
          {slots.isPending ? (
            <div className="grid grid-cols-3 gap-2">
              {[1, 2, 3, 4, 5, 6].map((n) => (
                <Skeleton key={n} className="h-16" />
              ))}
            </div>
          ) : slots.error ? (
            <Notice
              tone="error"
              title="No pudimos consultar la disponibilidad"
              action={
                <Button
                  variant="secondary"
                  onClick={() => {
                    void slots.refetch();
                  }}
                >
                  Reintentar
                </Button>
              }
            >
              {slots.error.message}
            </Notice>
          ) : !slots.data?.slots.length ? (
            <Notice
              tone="info"
              title={
                hours.data?.isClosed
                  ? 'No hay servicio para esta fecha'
                  : 'No hay turnos disponibles para esta búsqueda'
              }
            >
              Probá otra fecha, otra sucursal o un grupo diferente.
            </Notice>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                {slots.data.slots.map((slot) => (
                  <button
                    key={slot.startAt}
                    type="button"
                    aria-pressed={selected?.startAt === slot.startAt}
                    onClick={() => setSelected(slot)}
                    className={cn(
                      'flex min-h-16 flex-col items-center justify-center rounded-xl border px-2 py-3 transition',
                      selected?.startAt === slot.startAt
                        ? 'border-primary bg-primary text-primary-foreground shadow-md'
                        : 'border-border bg-card hover:border-primary',
                    )}
                  >
                    <span className="text-lg font-semibold">{hhmm(slot.startAt)}</span>
                    <span className="text-[11px]">
                      {restaurantDate(new Date(slot.startAt)) !== date
                        ? 'Día siguiente'
                        : slot.availableTables <= 2
                          ? 'Últimas mesas'
                          : 'Disponible'}
                    </span>
                  </button>
                ))}
              </div>
              <p className="mt-5 text-sm text-muted-foreground">
                El horario queda reservado al confirmar. Disponibilidad sujeta a cambios.
              </p>
            </>
          )}
        </section>
      </div>
      {selected && (
        <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-card/95 backdrop-blur">
          <Container className="flex items-center justify-between gap-4 py-4">
            <div className="min-w-0 text-sm">
              <p className="font-semibold">{formatDateTime(selected.startAt)}</p>
              <p className="text-muted-foreground">
                {branch.name} · {partySize} personas
              </p>
            </div>
            <Button size="lg" onClick={proceed}>
              Continuar
              <ArrowRight className="size-4" />
            </Button>
          </Container>
        </div>
      )}
    </Container>
  );
}

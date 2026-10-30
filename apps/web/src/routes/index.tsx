import { createFileRoute, Link } from '@tanstack/react-router';
import { MapPin, Phone } from 'lucide-react';
import { Button, Container, Notice, Skeleton, buttonVariants } from '@/components/kit';
import { useStore } from '@/lib/store';
import { hero } from '@/lib/presentation';
export const Route = createFileRoute('/')({
  head: () => ({ meta: [{ title: 'App Resto — Tu mesa, sin vueltas' }] }),
  component: Home,
});
function Home() {
  const { branches, branchesLoading, branchesError, reloadBranches } = useStore();
  return (
    <>
      <section className="relative overflow-hidden">
        <img
          src={hero}
          alt=""
          width={1600}
          height={1008}
          className="absolute inset-0 h-full w-full object-cover object-left opacity-90"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-background/60 to-background" />
        <Container className="relative flex min-h-[420px] items-center justify-end py-16 sm:min-h-[480px]">
          <div className="max-w-md rounded-2xl bg-background/85 p-6 backdrop-blur-sm sm:bg-transparent sm:p-0 sm:backdrop-blur-none">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-accent">
              Buena comida, buenos encuentros
            </p>
            <h1 className="mt-3 text-4xl font-semibold leading-[1.05] sm:text-5xl">
              Tu mesa,
              <br />
              sin vueltas.
            </h1>
            <p className="mt-4 text-lg text-muted-foreground">
              Elegí la sucursal, mirá los horarios libres y reservá en un par de pasos.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <a href="#sucursales" className={buttonVariants({ size: 'lg' })}>
                Reservá una mesa
              </a>
              <Link
                to="/mis-reservas"
                className={buttonVariants({ variant: 'secondary', size: 'lg' })}
              >
                Mis reservas
              </Link>
            </div>
          </div>
        </Container>
      </section>
      <Container className="py-14">
        <div id="sucursales" className="scroll-mt-20">
          <h2 className="text-3xl font-semibold">Elegí tu sucursal</h2>
          <p className="mt-2 text-muted-foreground">Consultá disponibilidad sin iniciar sesión.</p>
        </div>
        {branchesLoading ? (
          <div className="mt-8 grid gap-6 md:grid-cols-3">
            {[1, 2, 3].map((n) => (
              <Skeleton key={n} className="h-72" />
            ))}
          </div>
        ) : branchesError ? (
          <div className="mt-8">
            <Notice
              tone="error"
              title="No pudimos cargar las sucursales"
              action={
                <Button onClick={reloadBranches} variant="secondary">
                  Reintentar
                </Button>
              }
            >
              {branchesError.message}
            </Notice>
          </div>
        ) : !branches.length ? (
          <div className="mt-8">
            <Notice title="Todavía no hay sucursales disponibles">
              Volvé a consultar más adelante.
            </Notice>
          </div>
        ) : (
          <ul className="mt-8 grid gap-6 md:grid-cols-3">
            {branches.map((branch) => (
              <li
                key={branch.id}
                className="group flex flex-col overflow-hidden rounded-2xl border border-border bg-card"
              >
                <div className="relative aspect-[4/3] overflow-hidden">
                  <img
                    src={hero}
                    alt=""
                    className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 photo-scrim" />
                  <h3 className="absolute bottom-3 left-4 right-4 text-2xl font-semibold leading-tight text-on-photo">
                    {branch.name}
                  </h3>
                </div>
                <div className="flex flex-1 flex-col gap-4 p-5 text-sm">
                  <p className="flex gap-2 text-muted-foreground">
                    <MapPin className="size-4 shrink-0" />
                    {branch.address}
                  </p>
                  {branch.phone && (
                    <a
                      href={`tel:${branch.phone.replace(/[^+\d]/g, '')}`}
                      className="flex gap-2 text-muted-foreground"
                    >
                      <Phone className="size-4" />
                      {branch.phone}
                    </a>
                  )}
                  <Link
                    to="/reservar"
                    search={{ sucursal: branch.id }}
                    className={buttonVariants({
                      className: 'mt-auto min-h-11 h-auto w-full py-3 text-center leading-snug',
                    })}
                  >
                    Reservá en {branch.name}
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Container>
    </>
  );
}

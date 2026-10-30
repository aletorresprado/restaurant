import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { createRootRouteWithContext, HeadContent, Link, Outlet } from '@tanstack/react-router';
import { StoreProvider, useStore } from '@/lib/store';
import { Notice, SiteFooter, SiteHeader, buttonVariants } from '@/components/kit';

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: Root,
  notFoundComponent: () => (
    <div className="mx-auto max-w-xl p-12 text-center">
      <h1 className="text-3xl">No encontramos esta página</h1>
      <Link to="/" className={buttonVariants({ className: 'mt-6' })}>
        Volver al inicio
      </Link>
    </div>
  ),
  errorComponent: ({ reset }) => (
    <div className="mx-auto max-w-xl p-12">
      <Notice
        tone="error"
        title="No pudimos cargar esta pantalla"
        action={<button onClick={reset}>Reintentar</button>}
      >
        Tu reserva no se confirma desde esta pantalla de error. Consultá Mis reservas antes de
        volver a enviar una confirmación.
      </Notice>
    </div>
  ),
});
function SessionNotice() {
  const { authError } = useStore();
  return authError ? (
    <div className="mx-auto max-w-5xl px-5 pt-4">
      <Notice tone="warning" title="No pudimos verificar tu sesión">
        {authError} Intentá ingresar nuevamente cuando recuperes la conexión.
      </Notice>
    </div>
  ) : null;
}
function Root() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <StoreProvider>
        <HeadContent />
        <a
          href="#contenido"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:bg-card focus:p-3"
        >
          Saltar al contenido
        </a>
        <div className="flex min-h-screen flex-col">
          <SiteHeader />
          <SessionNotice />
          <main id="contenido" className="flex-1">
            <Outlet />
          </main>
          <SiteFooter />
        </div>
      </StoreProvider>
    </QueryClientProvider>
  );
}

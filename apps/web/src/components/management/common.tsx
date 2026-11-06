import { Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { api, type Branch, type Page } from '@/lib/api';
import { useStore } from '@/lib/store';
import { Button, Container, Notice, buttonVariants } from '@/components/kit';

export function ManagementAccess({
  admin = false,
  continueTo,
  children,
}: {
  admin?: boolean;
  continueTo?: 'mesas' | 'horarios';
  children: ReactNode;
}) {
  const { user, ready } = useStore();
  if (!ready)
    return (
      <Container className="py-12">
        <p>Cargando sesión…</p>
      </Container>
    );
  if (!user)
    return (
      <Container className="max-w-xl py-12">
        <Notice
          title="Ingresá con tu cuenta del restaurante"
          action={
            <Link
              to="/ingresar"
              search={{ continuar: continueTo ?? (admin ? 'administracion' : 'personal') }}
              className={buttonVariants()}
            >
              Ingresar
            </Link>
          }
        />
      </Container>
    );
  if (user.role === 'CUSTOMER' || (admin && user.role !== 'ADMIN'))
    return (
      <Container className="max-w-xl py-12">
        <Notice title="Tu cuenta no tiene acceso a esta sección">
          Necesitás{' '}
          {admin ? 'una cuenta de administración' : 'una cuenta de personal o administración'}.
          <p className="mt-3">
            <Link to="/mis-reservas" className="underline">
              Ir a mis reservas
            </Link>
          </p>
        </Notice>
      </Container>
    );
  // Unmount local forms when the authenticated account changes.
  return <div key={user.id}>{children}</div>;
}

export function useManagedBranches(admin = false) {
  const { user } = useStore();
  return useQuery({
    queryKey: ['management', user?.id, 'branches', admin],
    queryFn: async () => {
      const branches: Branch[] = [];
      let page = 1,
        totalPages = 1;
      do {
        const response = await api<Page<Branch>>(
          `/${admin ? 'admin' : 'staff'}/branches?page=${page}&limit=100`,
          {},
          true,
        );
        branches.push(...response.data);
        totalPages = response.meta.totalPages;
        page++;
      } while (page <= totalPages);
      return branches;
    },
    retry: false,
  });
}

export function QueryError({ error, retry }: { error: Error; retry: () => unknown }) {
  return (
    <Notice
      tone="error"
      title="No pudimos consultar los datos"
      action={
        <Button variant="secondary" onClick={() => void retry()}>
          Reintentar
        </Button>
      }
    >
      {error.message}
    </Notice>
  );
}

export function Pager({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}) {
  return (
    <div className="mt-5 flex items-center justify-between gap-2">
      <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        Anterior
      </Button>
      <span className="text-sm">
        Página {page} de {Math.max(1, totalPages)}
      </span>
      <Button
        variant="secondary"
        size="sm"
        disabled={page >= totalPages}
        onClick={() => onChange(page + 1)}
      >
        Siguiente
      </Button>
    </div>
  );
}

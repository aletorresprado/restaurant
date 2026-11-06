import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { ManagementAccess } from '@/components/management/common';
import { TableManagement } from '@/components/management/TableManagement';

export const Route = createFileRoute('/mesas')({
  validateSearch: (search: Record<string, unknown>): { sucursal?: string } => ({
    sucursal: z.string().uuid().safeParse(search.sucursal).success
      ? (search.sucursal as string)
      : undefined,
  }),
  head: () => ({ meta: [{ title: 'Mesas — App Resto' }, { name: 'robots', content: 'noindex' }] }),
  component: Tables,
});
function Tables() {
  const { sucursal } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <ManagementAccess continueTo="mesas">
      <TableManagement
        requestedBranch={sucursal}
        onBranchChange={(id) => void navigate({ search: { sucursal: id } })}
      />
    </ManagementAccess>
  );
}

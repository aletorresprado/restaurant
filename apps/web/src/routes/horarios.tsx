import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { ManagementAccess } from '@/components/management/common';
import { ScheduleManagement } from '@/components/management/ScheduleManagement';

export const Route = createFileRoute('/horarios')({
  validateSearch: (search: Record<string, unknown>): { sucursal?: string } => ({
    sucursal: z.string().uuid().safeParse(search.sucursal).success
      ? (search.sucursal as string)
      : undefined,
  }),
  head: () => ({
    meta: [{ title: 'Horarios y excepciones — App Resto' }, { name: 'robots', content: 'noindex' }],
  }),
  component: Schedules,
});
function Schedules() {
  const { sucursal } = Route.useSearch();
  const navigate = Route.useNavigate();
  return (
    <ManagementAccess continueTo="horarios">
      <ScheduleManagement
        requestedBranch={sucursal}
        onBranchChange={(id) => void navigate({ search: { sucursal: id } })}
      />
    </ManagementAccess>
  );
}

import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, errorMessage, type User, type Branch } from '@/lib/api';
import { useStore } from '@/lib/store';
import {
  clearManagement,
  managedPost,
  useManagementIntents,
  type ManagementIntent,
} from '@/lib/management-intent';
import { Button, Notice } from '@/components/kit';
import { formatDateTime } from '@/lib/format';

export function ManagementRecovery() {
  const { user } = useStore();
  return user && user.role !== 'CUSTOMER' ? <RecoveryList key={user.id} user={user} /> : null;
}
function RecoveryList({ user }: { user: User }) {
  const { records, error } = useManagementIntents(user.id);
  const [message, setMessage] = useState('');
  if (!records.length && !error && !message) return null;
  return (
    <section aria-label="Recuperar operaciones" className="mx-auto w-full max-w-5xl px-5 pt-4">
      {error && <Notice tone="warning">{error}</Notice>}
      {message && <Notice>{message}</Notice>}
      {!!records.length && (
        <details className="rounded-xl border border-border bg-card p-4">
          <summary className="cursor-pointer font-semibold">
            Operaciones pendientes ({records.length})
          </summary>
          <p className="mt-3 text-sm">
            Revisá el destino y los datos originales. Recuperar el mismo intento no duplica
            registros ni puntos. Las otras pestañas de tu cuenta comparten estos pendientes.
            Se conservan en este equipo hasta resolverlos y se muestran al ingresar con la cuenta
            que los inició.
          </p>
          <div className="mt-4 space-y-4">
            {records.map((record) => (
              <RecoveryRow
                key={record.operationId}
                record={record}
                user={user}
                onMessage={setMessage}
              />
            ))}
          </div>
        </details>
      )}
    </section>
  );
}
function RecoveryRow({
  record,
  user,
  onMessage,
}: {
  record: ManagementIntent;
  user: User;
  onMessage: (message: string) => void;
}) {
  const client = useQueryClient();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const adjustment = record.path.includes('/loyalty/adjustments');
  const branchId = /\/staff\/branches\/([^/]+)/.exec(record.path)?.[1];
  const tableId = /\/tables\/([^/]+)\/blocks$/.exec(record.path)?.[1];
  const customerId = /\/admin\/users\/([^/]+)/.exec(record.path)?.[1];
  const label = adjustment
    ? 'Ajuste de puntos'
    : tableId
      ? 'Bloqueo temporal'
      : record.path.endsWith('/tables')
        ? 'Alta de mesa'
        : record.path.endsWith('/schedules')
          ? 'Alta de horario'
          : record.path.endsWith('/schedule-exceptions')
            ? 'Alta de excepción'
            : 'Alta de sucursal';
  const destination = useQuery({
    queryKey: ['management', user.id, 'pending-destination', record.path],
    enabled: !!branchId || !!customerId,
    retry: false,
    queryFn: async () => {
      if (customerId) {
        const customer = await api<User>(`/admin/users/${customerId}`, {}, true);
        return `${customer.firstName} ${customer.lastName} · ${customer.email}`;
      }
      const branch = await api<Branch>(`/staff/branches/${branchId}`, {}, true);
      const table = tableId
        ? await api<{ tableNumber: string }>(
            `/staff/branches/${branchId}/tables/${tableId}`,
            {},
            true,
          )
        : null;
      return `${branch.name}${table ? ` · Mesa ${table.tableNumber}` : ''}`;
    },
  });
  const names: Record<string, string> = {
    name: 'Nombre',
    address: 'Dirección',
    tableNumber: 'Mesa',
    capacity: 'Capacidad',
    dayOfWeek: 'Día semanal (1=lunes)',
    date: 'Fecha',
    openingTime: 'Apertura',
    closingTime: 'Cierre',
    startAt: 'Inicio',
    endAt: 'Fin',
    reason: 'Motivo',
    points: 'Puntos',
    isClosed: 'Cerrado',
    phone: 'Teléfono',
    latitude: 'Latitud',
    longitude: 'Longitud',
    isActive: 'Activo',
    reservationIntervalMinutes: 'Intervalo (minutos)',
    tableStatus: 'Estado',
  };
  const recover = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await managedPost(record.path, record.body, user.id);
      onMessage(`${label}: resultado recuperado. Actualizamos los listados.`);
      await Promise.all(
        ['management', 'branches', 'availability', 'hours', 'loyalty'].map((key) =>
          client.invalidateQueries({ queryKey: [key] }),
        ),
      );
    } catch (error) {
      if (
        error instanceof ApiError &&
        [400, 404, 409, 410].includes(error.status) &&
        error.code !== 'OPERATION_MISMATCH'
      )
        onMessage(error.message);
      else setError(errorMessage(error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <article aria-label={label} className="space-y-3 rounded-xl border border-border p-4">
      <h3 className="font-semibold">{label}</h3>
      {(branchId || customerId) && (
        <p className="break-words text-sm">
          {destination.isPending
            ? 'Consultando destino…'
            : (destination.data ?? 'El destino no está disponible con tus permisos actuales.')}
        </p>
      )}
      <dl className="space-y-1 text-sm">
        {Object.entries(record.body)
          .filter(([key]) => names[key])
          .map(([key, value]) => {
            const text =
              typeof value === 'boolean'
                ? value
                  ? 'Sí'
                  : 'No'
                : (key === 'startAt' || key === 'endAt') &&
                    typeof value === 'string' &&
                    Number.isFinite(Date.parse(value))
                  ? formatDateTime(value)
                  : String(value);
            return (
              <div key={key} className="break-words">
                <dt className="inline font-medium">{names[key]}: </dt>
                <dd className="inline">{text}</dd>
              </div>
            );
          })}
      </dl>
      {error && <Notice tone="error">{error}</Notice>}
      <Button
        size="sm"
        loading={busy}
        disabled={
          !!customerId &&
          (destination.isPending ||
            (!!destination.error &&
              !(destination.error instanceof ApiError && destination.error.status === 404)))
        }
        onClick={() => void recover()}
      >
        {record.attempted ? 'Verificar y reintentar' : 'Confirmar operación revisada'}
      </Button>
      {destination.error && (
        <Button size="sm" variant="ghost" onClick={() => void destination.refetch()}>
          Consultar destino
        </Button>
      )}
      {!record.attempted && (
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() =>
            void clearManagement(user.id, record, true).catch((error) =>
              setError(errorMessage(error)),
            )
          }
        >
          Descartar borrador
        </Button>
      )}
    </article>
  );
}

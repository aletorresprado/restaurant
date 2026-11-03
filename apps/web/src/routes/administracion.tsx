import { createFileRoute } from '@tanstack/react-router';
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, post, ApiError, errorMessage, type Page } from '@/lib/api';
import { useStore } from '@/lib/store';
import { formatDateTime } from '@/lib/format';
import { Button, Container, Field, Notice, inputClass } from '@/components/kit';
import {
  ManagementAccess,
  Pager,
  QueryError,
  useManagedBranches,
} from '@/components/management/common';

export const Route = createFileRoute('/administracion')({
  head: () => ({
    meta: [{ title: 'Administración — App Resto' }, { name: 'robots', content: 'noindex' }],
  }),
  component: () => (
    <ManagementAccess admin>
      <Administration />
    </ManagementAccess>
  ),
});
type ManagedUser = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: 'CUSTOMER' | 'STAFF' | 'ADMIN';
  isActive: boolean;
};
type Movement = {
  id: string;
  kind: string;
  requestedPoints: number;
  points: number;
  balanceAfter: number;
  reason: string | null;
  actorId: string | null;
  reservationId: string | null;
  createdAt: string;
};
type Adjustment = { operationId: string; points: number; reason: string; attempted?: boolean };
const roles = { CUSTOMER: 'Cliente', STAFF: 'Personal', ADMIN: 'Administrador' };
const kinds: Record<string, string> = {
  ATTENDANCE: 'Asistencia',
  NO_SHOW: 'Ausencia',
  SURVEY: 'Encuesta',
  ADJUSTMENT: 'Ajuste administrativo',
};
function Administration() {
  const { user } = useStore();
  const [page, setPage] = useState(1),
    [selected, setSelected] = useState<ManagedUser | null>(null);
  const users = useQuery({
    queryKey: ['management', user?.id, 'users', page],
    queryFn: () => api<Page<ManagedUser>>(`/admin/users?page=${page}&limit=10`, {}, true),
    retry: false,
  });
  return (
    <Container className="py-10">
      <h1 className="text-3xl font-semibold">Administración</h1>
      <p className="mt-2 text-muted-foreground">
        Gestioná el acceso del personal y auditá la fidelización de cada cuenta.
      </p>
      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className="min-w-0 rounded-2xl border border-border bg-card p-5">
          <h2 className="text-xl font-semibold">Usuarios</h2>
          {users.isPending ? (
            <p className="mt-4">Cargando usuarios…</p>
          ) : users.error ? (
            <QueryError error={users.error} retry={users.refetch} />
          ) : (
            <>
              <ul className="mt-4 space-y-2">
                {users.data?.data.map((person) => (
                  <li key={person.id}>
                    <button
                      className={`w-full rounded-xl border p-3 text-left transition hover:bg-secondary ${selected?.id === person.id ? 'border-primary bg-secondary' : 'border-border'}`}
                      onClick={() => setSelected(person)}
                    >
                      <span className="block font-medium">
                        {person.firstName} {person.lastName}
                      </span>
                      <span className="block break-all text-sm text-muted-foreground">
                        {person.email}
                      </span>
                      <span className="mt-1 block text-xs">
                        {roles[person.role]} · {person.isActive ? 'Activo' : 'Inactivo'}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              {!users.data?.data.length && <p>No hay usuarios.</p>}
              <Pager page={page} totalPages={users.data?.meta.totalPages ?? 0} onChange={setPage} />
            </>
          )}
        </section>
        <div className="min-w-0">
          {selected ? (
            <UserManagement
              key={`${user?.id}:${selected.id}`}
              person={selected}
              onUpdate={setSelected}
            />
          ) : (
            <Notice title="Seleccioná una cuenta">
              Podés consultar sus puntos, realizar un ajuste con motivo y gestionar su acceso como
              personal.
            </Notice>
          )}
        </div>
      </div>
    </Container>
  );
}

function UserManagement({
  person,
  onUpdate,
}: {
  person: ManagedUser;
  onUpdate: (person: ManagedUser) => void;
}) {
  const client = useQueryClient();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [confirmRole, setConfirmRole] = useState(false);
  const changeRole = async () => {
    setBusy(true);
    setError('');
    try {
      const value = await api<ManagedUser>(
        `/admin/users/${person.id}/role`,
        {
          method: 'PATCH',
          body: JSON.stringify({ role: person.role === 'STAFF' ? 'CUSTOMER' : 'STAFF' }),
        },
        true,
      );
      onUpdate(value);
      setConfirmRole(false);
      await client.invalidateQueries({ queryKey: ['management'] });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-border bg-card p-5">
        <h2 className="text-xl font-semibold">
          {person.firstName} {person.lastName}
        </h2>
        <p className="mt-1 break-all text-sm text-muted-foreground">{person.email}</p>
        <p className="mt-2">Rol: {roles[person.role]}</p>
        {person.role !== 'ADMIN' && (
          <>
            <Button
              className="mt-3"
              variant="secondary"
              disabled={busy}
              onClick={() => setConfirmRole(true)}
            >
              {person.role === 'STAFF' ? 'Cambiar a cliente' : 'Habilitar como personal'}
            </Button>
            {confirmRole && (
              <div className="mt-3 space-y-3">
                <p className="text-sm">
                  {person.role === 'STAFF'
                    ? 'Al cambiar a cliente se eliminan todas sus asignaciones a sucursales.'
                    : 'Después de habilitarlo, asignale las sucursales donde podrá trabajar.'}
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button loading={busy} onClick={() => void changeRole()}>
                    Confirmar cambio de rol
                  </Button>
                  <Button variant="ghost" disabled={busy} onClick={() => setConfirmRole(false)}>
                    Volver
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
        {error && <Notice tone="error">{error}</Notice>}
      </section>
      {person.role === 'STAFF' && <Assignments userId={person.id} active={person.isActive} />}
      <UserLoyalty userId={person.id} />
    </div>
  );
}

function Assignments({ userId, active }: { userId: string; active: boolean }) {
  const branches = useManagedBranches(true);
  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <h3 className="text-xl font-semibold">Sucursales del personal</h3>
      <p className="mt-2 text-sm text-muted-foreground">
        Solo las sucursales activas asignadas permiten operar. Una sucursal inactiva conserva su
        asignación.
      </p>
      {branches.isPending ? (
        <p>Cargando sucursales…</p>
      ) : branches.error ? (
        <QueryError error={branches.error} retry={branches.refetch} />
      ) : (
        <div className="mt-4 space-y-3">
          {!branches.data?.length && <p>No hay sucursales.</p>}
          {branches.data?.map((branch) => (
            <Assignment
              key={branch.id}
              userId={userId}
              active={active}
              branchId={branch.id}
              name={branch.name}
              isActive={branch.isActive}
            />
          ))}
        </div>
      )}
    </section>
  );
}
function Assignment({
  userId,
  active,
  branchId,
  name,
  isActive,
}: {
  userId: string;
  active: boolean;
  branchId: string;
  name: string;
  isActive: boolean;
}) {
  const { user } = useStore();
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ['management', user?.id, 'staff', branchId],
    queryFn: () => api<{ user: { id: string } }[]>(`/admin/branches/${branchId}/staff`, {}, true),
    retry: false,
  });
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const assigned = query.data?.some((item) => item.user.id === userId);
  return (
    <div className="rounded-xl border border-border p-3">
      <p className="font-medium">
        {name} {!isActive && '(inactiva)'}
      </p>
      {query.isPending ? (
        <p>Cargando asignación…</p>
      ) : query.error ? (
        <QueryError error={query.error} retry={query.refetch} />
      ) : (
        <Button
          className="mt-2"
          size="sm"
          variant="secondary"
          loading={busy}
          disabled={!assigned && !active}
          onClick={async () => {
            setBusy(true);
            setError('');
            try {
              await api(
                `/admin/branches/${branchId}/staff/${userId}`,
                { method: assigned ? 'DELETE' : 'PUT' },
                true,
              );
            } catch (err) {
              setError(errorMessage(err));
            } finally {
              await client.invalidateQueries({ queryKey: ['management'] });
              setBusy(false);
            }
          }}
        >
          {assigned ? 'Retirar asignación' : 'Asignar sucursal'}
        </Button>
      )}
      {error && <Notice tone="error">{error}</Notice>}
    </div>
  );
}

function UserLoyalty({ userId }: { userId: string }) {
  const { user } = useStore();
  const client = useQueryClient();
  const [page, setPage] = useState(1),
    [points, setPoints] = useState(''),
    [reason, setReason] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [success, setSuccess] = useState('');
  const storageKey = `app-resto-adjustment:${user?.id}:${userId}`;
  const [intent, setIntent] = useState<Adjustment | null>(() => {
    try {
      const value = JSON.parse(sessionStorage.getItem(storageKey) ?? 'null');
      return value &&
        typeof value.operationId === 'string' &&
        typeof value.points === 'number' &&
        typeof value.reason === 'string'
        ? value
        : null;
    } catch {
      return null;
    }
  });
  const root = `/admin/users/${userId}/loyalty`;
  const summary = useQuery({
    queryKey: ['management', user?.id, 'loyalty', userId],
    queryFn: () => api<{ balance: number; tier: string }>(root, {}, true),
    retry: false,
  });
  const history = useQuery({
    queryKey: ['management', user?.id, 'movements', userId, page],
    queryFn: () => api<Page<Movement>>(`${root}/movements?page=${page}&limit=5`, {}, true),
    retry: false,
  });
  const send = async () => {
    if (busy || !intent) return;
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      sessionStorage.setItem(storageKey, JSON.stringify({ ...intent, attempted: true }));
      setIntent({ ...intent, attempted: true });
      const { operationId, points: requestedPoints, reason: adjustmentReason } = intent;
      const movement = await post<Movement>(
        `${root}/adjustments`,
        { operationId, points: requestedPoints, reason: adjustmentReason },
        true,
      );
      setSuccess(
        `Ajuste registrado: ${movement.points > 0 ? '+' : ''}${movement.points} puntos. Saldo resultante: ${movement.balanceAfter}.`,
      );
      sessionStorage.removeItem(storageKey);
      setIntent(null);
      setPoints('');
      setReason('');
      setPage(1);
    } catch (err) {
      setError(errorMessage(err));
      // A definite validation failure cannot have applied this operation. Other
      // failures retain the same UUID/body across retries, navigation and reload.
      if (err instanceof ApiError && err.status === 400) {
        sessionStorage.removeItem(storageKey);
        setIntent(null);
      }
    } finally {
      await client.invalidateQueries({ queryKey: ['management'] });
      await client.invalidateQueries({ queryKey: ['loyalty'] });
      setBusy(false);
    }
  };
  const valid =
    Number.isInteger(Number(points)) &&
    Number(points) !== 0 &&
    Math.abs(Number(points)) <= 10000 &&
    reason.trim().length >= 3;
  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <h3 className="text-xl font-semibold">Puntos y movimientos</h3>
      {summary.isPending ? (
        <p>Cargando saldo…</p>
      ) : summary.error ? (
        <QueryError error={summary.error} retry={summary.refetch} />
      ) : (
        <p className="mt-3 text-lg">
          {summary.data?.balance} puntos · Nivel {summary.data?.tier}
        </p>
      )}
      <div className="mt-5 space-y-3">
        <Field
          label="Puntos del ajuste"
          htmlFor="adjust-points"
          hint="Entero entre −10000 y 10000, distinto de cero."
        >
          <input
            id="adjust-points"
            type="number"
            min={-10000}
            max={10000}
            step={1}
            className={inputClass}
            disabled={busy || !!intent}
            value={intent?.points ?? points}
            onChange={(e) => setPoints(e.target.value)}
          />
        </Field>
        <Field label="Motivo del ajuste" htmlFor="adjust-reason">
          <input
            id="adjust-reason"
            className={inputClass}
            maxLength={500}
            disabled={busy || !!intent}
            value={intent?.reason ?? reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </Field>
        {intent ? (
          <>
            <Notice title="Ajuste pendiente de confirmación">
              Revisá los datos y confirmá. Si hubo un error de conexión, reintentar consulta o
              aplica esta misma operación sin duplicar puntos.
            </Notice>
            <Button loading={busy} onClick={() => void send()}>
              Confirmar ajuste
            </Button>
            {!intent.attempted && (
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  sessionStorage.removeItem(storageKey);
                  setIntent(null);
                }}
              >
                Volver a editar
              </Button>
            )}
          </>
        ) : (
          <Button
            disabled={!valid || !!summary.error || summary.isPending}
            onClick={() => {
              const value = {
                operationId: crypto.randomUUID(),
                points: Number(points),
                reason: reason.trim(),
              };
              try {
                sessionStorage.setItem(storageKey, JSON.stringify(value));
                setIntent(value);
                setError('');
                setSuccess('');
              } catch {
                setError(
                  'El navegador no permite guardar la operación. Habilitá el almacenamiento de la sesión para realizar ajustes con seguridad.',
                );
              }
            }}
          >
            Revisar ajuste
          </Button>
        )}
        {error && <Notice tone="error">{error}</Notice>}
        {success && <Notice tone="success">{success}</Notice>}
      </div>
      <h4 className="mt-6 font-semibold">Historial de puntos</h4>
      {history.isPending ? (
        <p>Cargando movimientos…</p>
      ) : history.error ? (
        <QueryError error={history.error} retry={history.refetch} />
      ) : (
        <>
          <ul className="mt-3 space-y-3">
            {history.data?.data.map((movement) => (
              <li key={movement.id} className="border-t border-border pt-3 text-sm">
                <p className="font-medium">
                  {kinds[movement.kind] ?? movement.kind}: {movement.points > 0 ? '+' : ''}
                  {movement.points} · Saldo {movement.balanceAfter}
                </p>
                <p>{formatDateTime(movement.createdAt)}</p>
                {movement.reason && <p className="break-words">{movement.reason}</p>}
                {movement.points !== movement.requestedPoints && (
                  <p>Solicitado: {movement.requestedPoints}; se aplicó el saldo mínimo.</p>
                )}
                <details className="mt-1 text-xs text-muted-foreground">
                  <summary>Ver referencias de auditoría</summary>
                  <p className="break-all">Movimiento: {movement.id}</p>
                  <p className="break-all">Actor: {movement.actorId ?? 'Sin cuenta asociada'}</p>
                  {movement.reservationId && (
                    <p className="break-all">Reserva: {movement.reservationId}</p>
                  )}
                </details>
              </li>
            ))}
          </ul>
          {!history.data?.data.length && <p className="mt-3 text-sm">No hay movimientos.</p>}
          <Pager page={page} totalPages={history.data?.meta.totalPages ?? 0} onChange={setPage} />
        </>
      )}
    </section>
  );
}

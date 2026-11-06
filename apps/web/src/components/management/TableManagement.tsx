import { useState, type FormEvent } from 'react';
import { Link } from '@tanstack/react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { CreateRestaurantTableSchema, UpdateRestaurantTableSchema } from '@repo/validation';
import { TableStatus } from '@repo/shared-types';
import { api, post, ApiError, errorMessage, type Branch, type Page } from '@/lib/api';
import { useStore } from '@/lib/store';
import { Button, Container, Field, Notice, inputClass } from '@/components/kit';
import { Pager, QueryError, useManagedBranches } from './common';
import { TableBlocks } from './TableBlocks';

type RestaurantTable = {
  id: string;
  tableNumber: string;
  capacity: number;
  tableStatus: TableStatus;
};
const statuses = {
  [TableStatus.ACTIVE]: { label: 'Activa', className: 'bg-success-soft text-success' },
  [TableStatus.BLOCKED]: { label: 'Bloqueada', className: 'bg-warning-soft text-warning' },
  [TableStatus.OUT_OF_SERVICE]: {
    label: 'Fuera de servicio',
    className: 'bg-muted text-muted-foreground',
  },
};

export function TableManagement({
  requestedBranch,
  onBranchChange,
}: {
  requestedBranch?: string;
  onBranchChange: (id: string) => void;
}) {
  const { user } = useStore();
  const branches = useManagedBranches(user?.role === 'ADMIN');
  const [editingBranch, setEditingBranch] = useState<string | null>(null);
  const branch = requestedBranch
    ? branches.data?.find((b) => b.id === requestedBranch)
    : branches.data?.[0];
  return (
    <Container className="max-w-3xl py-10">
      <h1 className="text-3xl font-semibold">Mesas</h1>
      <p className="mt-2 text-muted-foreground">
        Gestioná la capacidad y el estado de las mesas por sucursal.
      </p>
      {branches.isPending ? (
        <p className="mt-6">Cargando sucursales…</p>
      ) : branches.error ? (
        <div className="mt-6">
          <QueryError error={branches.error} retry={branches.refetch} />
        </div>
      ) : !branches.data?.length ? (
        <div className="mt-6">
          <Notice title="No hay sucursales disponibles">
            {user?.role === 'ADMIN'
              ? 'Creá una sucursal desde Administración para configurar sus mesas.'
              : 'Pedile a un administrador que te asigne una sucursal activa.'}
          </Notice>
        </div>
      ) : (
        <>
          <div className="mt-6">
            <Field label="Sucursal de las mesas" htmlFor="tables-branch">
              <select
                id="tables-branch"
                className={inputClass}
                value={branch?.id ?? ''}
                disabled={!!branch && editingBranch === branch.id}
                onChange={(e) => {
                  setEditingBranch(null);
                  onBranchChange(e.target.value);
                }}
              >
                <option value="" disabled>
                  Elegí una sucursal
                </option>
                {branches.data.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                    {!b.isActive ? ' (inactiva)' : ''}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          {!branch ? (
            <div className="mt-4">
              <Notice title="La sucursal no está disponible para tu cuenta">
                Elegí otra sucursal de la lista. Si cambió tu asignación, pedile a un administrador
                que la revise.
              </Notice>
            </div>
          ) : (
            <TablesForBranch
              key={`${user?.id}:${branch.id}`}
              branch={branch}
              onEditingChange={(editing) => setEditingBranch(editing ? branch.id : null)}
            />
          )}
        </>
      )}
    </Container>
  );
}

function TablesForBranch({
  branch,
  onEditingChange,
}: {
  branch: Branch;
  onEditingChange: (editing: boolean) => void;
}) {
  const { user } = useStore();
  const [page, setPage] = useState(1),
    [editing, setEditing] = useState<RestaurantTable | 'new' | null>(null),
    [blocking, setBlocking] = useState<RestaurantTable | null>(null),
    [success, setSuccess] = useState('');
  const tables = useQuery({
    queryKey: ['management', user?.id, 'tables', branch.id, page],
    queryFn: () =>
      api<Page<RestaurantTable>>(
        `/staff/branches/${branch.id}/tables?page=${page}&limit=10`,
        {},
        true,
      ),
    retry: false,
  });
  const edit = (table: RestaurantTable | 'new' | null) => {
    setEditing(table);
    onEditingChange(table !== null || blocking !== null);
  };
  return (
    <>
      {!branch.isActive && (
        <div className="mt-4">
          <Notice title="Sucursal inactiva">
            Podés configurar sus mesas como administrador. No se ofrecen turnos ni acceso al
            personal hasta reactivarla.
          </Notice>
        </div>
      )}
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-semibold">Mesas de {branch.name}</h2>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            size="sm"
            disabled={editing !== null || blocking !== null}
            onClick={() => void tables.refetch()}
          >
            Actualizar mesas
          </Button>
          <Button
            size="sm"
            disabled={editing !== null || blocking !== null || !!tables.error || tables.isPending}
            onClick={() => {
              setSuccess('');
              edit('new');
            }}
          >
            Nueva mesa
          </Button>
        </div>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">
        El número es único en esta sucursal y queda fijo al crear la mesa. Bloqueada y fuera de
        servicio dejan de ofrecerse para nuevas reservas; no eliminan la mesa ni su historial.
      </p>
      {success && (
        <div className="mt-4">
          <Notice tone="success">{success}</Notice>
        </div>
      )}
      {editing !== null && (
        <TableForm
          key={editing === 'new' ? 'new' : editing.id}
          branchId={branch.id}
          table={editing === 'new' ? null : editing}
          onClose={() => edit(null)}
          onSaved={(table) => {
            edit(null);
            setSuccess(`Mesa ${table.tableNumber} guardada.`);
          }}
        />
      )}
      {blocking && (
        <TableBlocks
          key={blocking.id}
          branchId={branch.id}
          tableId={blocking.id}
          tableNumber={blocking.tableNumber}
          onClose={() => {
            setBlocking(null);
            onEditingChange(editing !== null);
          }}
        />
      )}
      <div className="mt-5">
        {tables.isPending ? (
          <p>Cargando mesas…</p>
        ) : tables.error ? (
          <QueryError error={tables.error} retry={tables.refetch} />
        ) : !tables.data?.data.length ? (
          <Notice title="Todavía no hay mesas en esta sucursal">
            Usá Nueva mesa para comenzar. También necesitás horarios configurados para ofrecer
            turnos.
          </Notice>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {tables.data.data.map((table) => (
              <li key={table.id} className="rounded-2xl border border-border bg-card p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-xl font-semibold">Mesa {table.tableNumber}</h3>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${statuses[table.tableStatus].className}`}
                  >
                    {statuses[table.tableStatus].label}
                  </span>
                </div>
                <p className="mt-3 text-sm">
                  Capacidad: {table.capacity} {table.capacity === 1 ? 'persona' : 'personas'}
                </p>
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-4"
                  disabled={editing !== null || blocking !== null}
                  onClick={() => {
                    setSuccess('');
                    edit(table);
                  }}
                  aria-label={`Editar mesa ${table.tableNumber}`}
                >
                  Editar mesa
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-3 ml-2"
                  disabled={editing !== null || blocking !== null}
                  aria-label={`Ver bloqueos de mesa ${table.tableNumber}`}
                  onClick={() => {
                    setBlocking(table);
                    setSuccess('');
                    onEditingChange(true);
                  }}
                >
                  Bloqueos temporales
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {tables.data && editing === null && blocking === null && (
        <Pager page={page} totalPages={tables.data.meta.totalPages} onChange={setPage} />
      )}
      <p className="mt-5 text-sm text-muted-foreground">
        El estado no indica si una mesa está ocupada en este momento: revisá las reservas en{' '}
        <Link to="/personal" className="underline">
          Agenda
        </Link>
        . Configurá los servicios en{' '}
        <Link to="/horarios" search={{ sucursal: branch.id }} className="underline">
          Horarios
        </Link>
        . Usá Bloqueos temporales en cada mesa para administrar intervalos por fecha.
      </p>
    </>
  );
}

function TableForm({
  branchId,
  table,
  onClose,
  onSaved,
}: {
  branchId: string;
  table: RestaurantTable | null;
  onClose: () => void;
  onSaved: (table: RestaurantTable) => void;
}) {
  const client = useQueryClient();
  const [number, setNumber] = useState(''),
    [capacity, setCapacity] = useState(table?.capacity.toString() ?? '2'),
    [status, setStatus] = useState(table?.tableStatus ?? TableStatus.ACTIVE);
  const [busy, setBusy] = useState(false),
    [confirm, setConfirm] = useState(false),
    [uncertain, setUncertain] = useState(false),
    [error, setError] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const changed = !table || Number(capacity) !== table.capacity || status !== table.tableStatus;
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || uncertain || !changed) return;
    setError('');
    setErrors({});
    const body = table
      ? {
          ...(Number(capacity) !== table.capacity ? { capacity: Number(capacity) } : {}),
          ...(status !== table.tableStatus ? { tableStatus: status } : {}),
        }
      : { tableNumber: number, capacity: Number(capacity) };
    const parsed = (table ? UpdateRestaurantTableSchema : CreateRestaurantTableSchema).safeParse(
      body,
    );
    if (!parsed.success) {
      setErrors(
        Object.fromEntries(
          parsed.error.issues.map((issue) => [issue.path[0]?.toString() ?? 'form', issue.message]),
        ),
      );
      return;
    }
    if (table && status !== table.tableStatus && status !== TableStatus.ACTIVE && !confirm) {
      setConfirm(true);
      return;
    }
    setBusy(true);
    try {
      const root = `/staff/branches/${branchId}/tables`;
      const saved = table
        ? await api<RestaurantTable>(
            `${root}/${table.id}`,
            { method: 'PATCH', body: JSON.stringify(parsed.data) },
            true,
          )
        : await post<RestaurantTable>(root, parsed.data, true);
      await client.invalidateQueries({ queryKey: ['management'] });
      await client.invalidateQueries({ queryKey: ['availability'] });
      onSaved(saved);
    } catch (err) {
      setError(errorMessage(err));
      if (!table && err instanceof ApiError && (err.status === 0 || err.status >= 500))
        setUncertain(true);
      await client.invalidateQueries({ queryKey: ['management'] });
    } finally {
      setBusy(false);
    }
  };
  return (
    <form
      aria-label={table ? `Editar mesa ${table.tableNumber}` : 'Crear mesa'}
      className="mt-5 space-y-4 rounded-2xl border border-primary/40 bg-card p-5"
      onSubmit={submit}
      noValidate
    >
      <h3 className="text-xl font-semibold">
        {table ? `Editar mesa ${table.tableNumber}` : 'Crear mesa'}
      </h3>
      {table ? (
        <p className="text-sm text-muted-foreground">
          El número {table.tableNumber} no se puede cambiar.
        </p>
      ) : (
        <Field
          label="Número de mesa"
          htmlFor="table-number"
          error={errors.tableNumber}
          hint="Hasta 10 letras, números o guiones. Ejemplo: A-1."
        >
          <input
            autoFocus
            id="table-number"
            className={inputClass}
            maxLength={10}
            value={number}
            disabled={busy || uncertain}
            aria-invalid={!!errors.tableNumber}
            aria-describedby={errors.tableNumber ? 'table-number-error' : 'table-number-hint'}
            onChange={(e) => setNumber(e.target.value)}
          />
        </Field>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          label="Capacidad de la mesa"
          htmlFor="table-capacity"
          error={errors.capacity}
          hint="Entre 1 y 50 personas."
        >
          <input
            id="table-capacity"
            className={inputClass}
            type="number"
            min={1}
            max={50}
            step={1}
            value={capacity}
            disabled={busy || uncertain}
            aria-invalid={!!errors.capacity}
            aria-describedby={errors.capacity ? 'table-capacity-error' : 'table-capacity-hint'}
            onChange={(e) => {
              setCapacity(e.target.value);
              setConfirm(false);
            }}
          />
        </Field>
        {table && (
          <Field label="Estado de la mesa" htmlFor="table-status" error={errors.tableStatus}>
            <select
              id="table-status"
              className={inputClass}
              value={status}
              disabled={busy}
              onChange={(e) => {
                setStatus(e.target.value as TableStatus);
                setConfirm(false);
              }}
            >
              {Object.entries(statuses).map(([value, item]) => (
                <option key={value} value={value}>
                  {item.label}
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>
      {!table && <p className="text-sm">Las mesas nuevas se crean activas.</p>}
      {confirm && (
        <Notice tone="warning" title="Confirmá el cambio de estado">
          La mesa quedará {statuses[status].label.toLowerCase()} y dejará de ofrecerse para nuevas
          reservas hasta reactivarla. La API impedirá el cambio si afecta reservas vigentes.
        </Notice>
      )}
      {error && <Notice tone="error">{error}</Notice>}
      {uncertain && (
        <Notice tone="warning" title="No pudimos confirmar si se creó la mesa">
          Cerrá el formulario y revisá el número en esta sucursal antes de volver a crearla. No
          reenviamos el alta automáticamente.
        </Notice>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={busy} disabled={uncertain || !changed}>
          {confirm ? 'Confirmar cambio de estado' : table ? 'Guardar mesa' : 'Crear mesa'}
        </Button>
        <Button variant="ghost" type="button" disabled={busy} onClick={onClose}>
          {uncertain ? 'Cerrar y revisar mesas' : 'Cancelar edición'}
        </Button>
      </div>
    </form>
  );
}

import { useState, type FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BUSINESS_CONFIG } from '@repo/config';
import { CreateTableBlockSchema } from '@repo/validation';
import { api, post, ApiError, errorMessage, type Page } from '@/lib/api';
import { useStore } from '@/lib/store';
import { restaurantDate, formatDateTime } from '@/lib/format';
import { restaurantInstant } from '@/lib/restaurant-time';
import { Button, Field, Notice, inputClass } from '@/components/kit';
import { Pager, QueryError } from './common';

type TableBlock = { id: string; startAt: string; endAt: string; reason: string };
export function TableBlocks({
  branchId,
  tableId,
  tableNumber,
  onClose,
}: {
  branchId: string;
  tableId: string;
  tableNumber: string;
  onClose: () => void;
}) {
  const { user } = useStore();
  const client = useQueryClient();
  const [page, setPage] = useState(1),
    [creating, setCreating] = useState(false),
    [removing, setRemoving] = useState<TableBlock | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [success, setSuccess] = useState('');
  const root = `/staff/branches/${branchId}/tables/${tableId}/blocks`;
  const query = useQuery({
    queryKey: ['management', user?.id, 'blocks', branchId, tableId, page],
    queryFn: () => api<Page<TableBlock>>(`${root}?page=${page}&limit=10`, {}, true),
    retry: false,
  });
  const refresh = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ['management'] }),
      client.invalidateQueries({ queryKey: ['availability'] }),
    ]);
  };
  const remove = async () => {
    if (!removing || busy) return;
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      await api(`${root}/${removing.id}`, { method: 'DELETE' }, true);
      setRemoving(null);
      setSuccess(
        'Bloqueo retirado. La disponibilidad vuelve a considerar el resto de las condiciones de la mesa.',
      );
      await refresh();
    } catch (err) {
      setError(`${errorMessage(err)} Revisá el listado actualizado antes de repetir.`);
      await refresh();
    } finally {
      setBusy(false);
    }
  };
  return (
    <section
      aria-label={`Bloqueos de mesa ${tableNumber}`}
      className="mt-5 space-y-4 rounded-2xl border border-primary/40 bg-card p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-2xl font-semibold">Bloqueos de mesa {tableNumber}</h3>
        <Button variant="ghost" size="sm" disabled={busy} onClick={onClose}>
          Cerrar bloqueos
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        Fechas y horas de {BUSINESS_CONFIG.timezone}. Un bloqueo temporal no cambia el estado de la
        mesa. Retirarlo no reactiva una mesa Bloqueada o Fuera de servicio.
      </p>
      {success && <Notice tone="success">{success}</Notice>}
      {error && <Notice tone="error">{error}</Notice>}
      {!creating && !removing && (
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={query.isPending || !!query.error}
            onClick={() => {
              setSuccess('');
              setError('');
              setCreating(true);
            }}
          >
            Nuevo bloqueo
          </Button>
          <Button size="sm" variant="secondary" onClick={() => void query.refetch()}>
            Actualizar bloqueos
          </Button>
        </div>
      )}
      {creating && (
        <BlockForm
          root={root}
          onBusy={setBusy}
          onClose={() => setCreating(false)}
          onRefresh={refresh}
          onSaved={async () => {
            await refresh();
            setCreating(false);
            setSuccess('Bloqueo guardado. La mesa no se ofrecerá en ese intervalo.');
          }}
        />
      )}
      {removing && (
        <div
          role="group"
          aria-label="Confirmar retirada"
          className="space-y-3 rounded-xl border border-border p-4"
        >
          <Notice tone="warning" title="¿Retirás este bloqueo?">
            {formatDateTime(removing.startAt)} a {formatDateTime(removing.endAt)}. Se elimina el
            bloqueo y no se puede deshacer desde esta pantalla.
          </Notice>
          <div className="flex flex-wrap gap-2">
            <Button variant="danger" size="sm" loading={busy} onClick={() => void remove()}>
              Confirmar retirada
            </Button>
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => setRemoving(null)}>
              Cancelar retirada
            </Button>
          </div>
        </div>
      )}
      {query.isPending ? (
        <p>Cargando bloqueos…</p>
      ) : query.error ? (
        <QueryError error={query.error} retry={query.refetch} />
      ) : !query.data?.data.length ? (
        <Notice title="No hay bloqueos en esta mesa" />
      ) : (
        <ul className="space-y-3">
          {query.data.data.map((block) => (
            <li key={block.id} className="rounded-xl border border-border p-4">
              <p className="font-medium">Desde: {formatDateTime(block.startAt)}</p>
              <p className="mt-1">Hasta: {formatDateTime(block.endAt)}</p>
              <p className="mt-2 break-words text-sm">Motivo: {block.reason}</p>
              <Button
                variant="secondary"
                size="sm"
                className="mt-3"
                disabled={creating || !!removing}
                onClick={() => {
                  setError('');
                  setSuccess('');
                  setRemoving(block);
                }}
                aria-label={`Retirar bloqueo ${block.reason}`}
              >
                Retirar bloqueo
              </Button>
            </li>
          ))}
        </ul>
      )}
      {query.data && !creating && !removing && (
        <Pager page={page} totalPages={query.data.meta.totalPages} onChange={setPage} />
      )}
      <p className="text-xs text-muted-foreground">
        Se listan también los bloqueos pasados. No hay edición de intervalos: para corregir uno,
        retiralo y creá el correcto.
      </p>
    </section>
  );
}

function BlockForm({
  root,
  onBusy,
  onClose,
  onRefresh,
  onSaved,
}: {
  root: string;
  onBusy: (busy: boolean) => void;
  onClose: () => void;
  onRefresh: () => Promise<void>;
  onSaved: () => Promise<void>;
}) {
  const [start, setStart] = useState(`${restaurantDate()}T12:00`),
    [end, setEnd] = useState(`${restaurantDate()}T14:00`),
    [reason, setReason] = useState('');
  const [confirmation, setConfirmation] = useState<{
      startAt: string;
      endAt: string;
      reason: string;
    } | null>(null),
    [busy, setBusy] = useState(false),
    [uncertain, setUncertain] = useState(false),
    [error, setError] = useState(''),
    [errors, setErrors] = useState<Record<string, string>>({});
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || uncertain) return;
    setError('');
    setErrors({});
    const converted: Record<string, string> = {},
      validationErrors: Record<string, string> = {};
    for (const [field, value] of [
      ['startAt', start],
      ['endAt', end],
    ]) {
      try {
        converted[field] = restaurantInstant(value);
      } catch (err) {
        validationErrors[field] = errorMessage(err);
      }
    }
    if (Object.keys(validationErrors).length) {
      setErrors(validationErrors);
      return;
    }
    const parsed = CreateTableBlockSchema.safeParse({ ...converted, reason });
    if (!parsed.success) {
      setErrors(
        Object.fromEntries(
          parsed.error.issues.map((issue) => [
            String(issue.path[0]),
            issue.path[0] === 'endAt' ? 'El fin debe ser posterior al inicio.' : issue.message,
          ]),
        ),
      );
      return;
    }
    if (!confirmation) {
      setConfirmation(parsed.data);
      return;
    }
    setBusy(true);
    onBusy(true);
    try {
      await post(root, confirmation, true);
      await onSaved();
    } catch (err) {
      setError(errorMessage(err));
      if (err instanceof ApiError && (err.status === 0 || err.status >= 500)) setUncertain(true);
      await onRefresh();
    } finally {
      setBusy(false);
      onBusy(false);
    }
  };
  return (
    <form
      aria-label="Crear bloqueo temporal"
      onSubmit={submit}
      noValidate
      className="space-y-4 rounded-xl border border-border p-4"
    >
      <h4 className="text-lg font-semibold">Crear bloqueo temporal</h4>
      <p className="text-sm">
        Completá ambos extremos en la zona del restaurante. Para cruzar medianoche, elegí la fecha
        siguiente en el fin.
      </p>
      <Field label="Inicio del bloqueo" htmlFor="block-start" error={errors.startAt}>
        <input
          id="block-start"
          type="datetime-local"
          step={60}
          className={inputClass}
          value={start}
          disabled={busy || uncertain}
          aria-invalid={!!errors.startAt}
          aria-describedby={errors.startAt ? 'block-start-error' : undefined}
          onChange={(e) => {
            setStart(e.target.value);
            setConfirmation(null);
          }}
        />
      </Field>
      <Field label="Fin del bloqueo" htmlFor="block-end" error={errors.endAt}>
        <input
          id="block-end"
          type="datetime-local"
          step={60}
          className={inputClass}
          value={end}
          disabled={busy || uncertain}
          aria-invalid={!!errors.endAt}
          aria-describedby={errors.endAt ? 'block-end-error' : undefined}
          onChange={(e) => {
            setEnd(e.target.value);
            setConfirmation(null);
          }}
        />
      </Field>
      <Field
        label="Motivo del bloqueo"
        htmlFor="block-reason"
        error={errors.reason}
        hint="Obligatorio, entre 3 y 500 caracteres."
      >
        <input
          id="block-reason"
          className={inputClass}
          value={reason}
          maxLength={500}
          disabled={busy || uncertain}
          aria-invalid={!!errors.reason}
          aria-describedby={errors.reason ? 'block-reason-error' : 'block-reason-hint'}
          onChange={(e) => {
            setReason(e.target.value);
            setConfirmation(null);
          }}
        />
      </Field>
      {confirmation && (
        <Notice title="Revisá el intervalo del bloqueo">
          <p>Inicio: {formatDateTime(confirmation.startAt)}</p>
          <p>Fin: {formatDateTime(confirmation.endAt)}</p>
          <p className="mt-1 break-words">Motivo: {confirmation.reason}</p>
        </Notice>
      )}
      {error && <Notice tone="error">{error}</Notice>}
      {uncertain && (
        <Notice tone="warning" title="No pudimos confirmar si se creó el bloqueo">
          Cerrá el formulario y revisá el listado antes de crear otro. No reenviamos el alta
          automáticamente.
        </Notice>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" loading={busy} disabled={uncertain}>
          {confirmation ? 'Confirmar bloqueo' : 'Revisar bloqueo'}
        </Button>
        <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={onClose}>
          {uncertain ? 'Cerrar y revisar bloqueos' : 'Cancelar bloqueo'}
        </Button>
      </div>
    </form>
  );
}

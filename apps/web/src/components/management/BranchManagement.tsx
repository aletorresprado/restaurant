import { useState, type FormEvent } from 'react';
import { Link } from '@tanstack/react-router';
import { useQueryClient } from '@tanstack/react-query';
import { CreateBranchSchema, UpdateBranchSchema } from '@repo/validation';
import { api, post, ApiError, errorMessage, type Branch } from '@/lib/api';
import { Button, Field, Notice, inputClass, buttonVariants } from '@/components/kit';
import { QueryError, useManagedBranches } from './common';
import { BranchPhoto } from './BranchPhoto';

export function BranchManagement() {
  const branches = useManagedBranches(true);
  const [editing, setEditing] = useState<Branch | 'new' | null>(null);
  const [saved, setSaved] = useState('');
  return (
    <section className="mt-6" aria-label="Gestión de sucursales">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl font-semibold">Sucursales</h2>
        <Button
          onClick={() => {
            setEditing('new');
            setSaved('');
          }}
          disabled={editing !== null}
        >
          Nueva sucursal
        </Button>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        Las sucursales activas aparecen en el catálogo. Para ofrecer reservas necesitan mesas y
        horarios configurados.
      </p>
      {saved && (
        <div className="mt-4">
          <Notice tone="success">{saved}</Notice>
        </div>
      )}
      {editing !== null && (
        <BranchForm
          key={editing === 'new' ? 'new' : editing.id}
          branch={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(branch) => {
            setEditing(null);
            setSaved(`Sucursal «${branch.name}» guardada.`);
          }}
        />
      )}
      <div className="mt-5">
        {branches.isPending ? (
          <p>Cargando sucursales…</p>
        ) : branches.error ? (
          <QueryError error={branches.error} retry={branches.refetch} />
        ) : !branches.data?.length ? (
          <Notice title="Todavía no hay sucursales">Creá la primera sucursal para comenzar.</Notice>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2">
            {branches.data.map((branch) => (
              <li key={branch.id} className="min-w-0 rounded-2xl border border-border bg-card p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="break-words text-xl font-semibold">{branch.name}</h3>
                  <span
                    className={`rounded-full px-3 py-1 text-xs font-semibold ${branch.isActive ? 'bg-success-soft text-success' : 'bg-muted text-muted-foreground'}`}
                  >
                    {branch.isActive ? 'Activa' : 'Inactiva'}
                  </span>
                </div>
                <p className="mt-2 break-words text-sm">{branch.address}</p>
                {branch.phone && (
                  <p className="mt-1 text-sm text-muted-foreground">{branch.phone}</p>
                )}
                {branch.latitude != null && branch.longitude != null && (
                  <p className="mt-1 break-words text-xs text-muted-foreground">
                    Coordenadas: {branch.latitude}, {branch.longitude}
                  </p>
                )}
                <Button
                  variant="secondary"
                  size="sm"
                  className="mt-4"
                  disabled={editing !== null}
                  onClick={() => {
                    setEditing(branch);
                    setSaved('');
                  }}
                >
                  <span aria-hidden>Editar sucursal</span>
                  <span className="sr-only">Editar {branch.name}</span>
                </Button>
                <BranchPhoto branch={branch} />
                <Link
                  to="/mesas"
                  search={{ sucursal: branch.id }}
                  className={buttonVariants({
                    variant: 'secondary',
                    size: 'sm',
                    className: 'mt-4',
                  })}
                >
                  Gestionar mesas
                </Link>
                <Link
                  to="/horarios"
                  search={{ sucursal: branch.id }}
                  className={buttonVariants({
                    variant: 'secondary',
                    size: 'sm',
                    className: 'mt-4 ml-2',
                  })}
                >
                  Gestionar horarios
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function BranchForm({
  branch,
  onClose,
  onSaved,
}: {
  branch: Branch | null;
  onClose: () => void;
  onSaved: (branch: Branch) => void;
}) {
  const client = useQueryClient();
  const [name, setName] = useState(branch?.name ?? ''),
    [address, setAddress] = useState(branch?.address ?? ''),
    [phone, setPhone] = useState(branch?.phone ?? '');
  const [latitude, setLatitude] = useState(branch?.latitude?.toString() ?? ''),
    [longitude, setLongitude] = useState(branch?.longitude?.toString() ?? '');
  const [active, setActive] = useState(branch?.isActive ?? true),
    [confirm, setConfirm] = useState(false),
    [busy, setBusy] = useState(false),
    [uncertain, setUncertain] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({}),
    [error, setError] = useState('');
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || uncertain) return;
    setError('');
    setErrors({});
    if (!!latitude.trim() !== !!longitude.trim()) {
      setErrors({ longitude: 'Completá latitud y longitud juntas.' });
      return;
    }
    // Existing API supports replacing contact/coordinates, but not clearing them.
    if (branch?.phone && !phone.trim()) {
      setErrors({
        phone: 'El teléfono existente debe conservarse o reemplazarse por otro válido.',
      });
      return;
    }
    if (
      (branch?.latitude != null || branch?.longitude != null) &&
      (!latitude.trim() || !longitude.trim())
    ) {
      setErrors({
        longitude: 'Las coordenadas existentes deben conservarse o reemplazarse juntas.',
      });
      return;
    }
    const body = {
      name,
      address,
      isActive: active,
      ...(phone.trim() ? { phone: phone.trim() } : {}),
      ...(latitude.trim() ? { latitude: Number(latitude) } : {}),
      ...(longitude.trim() ? { longitude: Number(longitude) } : {}),
    };
    const parsed = (branch ? UpdateBranchSchema : CreateBranchSchema).safeParse(body);
    if (!parsed.success) {
      setErrors(
        Object.fromEntries(
          parsed.error.issues.map((issue) => [issue.path[0]?.toString() ?? 'form', issue.message]),
        ),
      );
      return;
    }
    if (branch?.isActive && !active && !confirm) {
      setConfirm(true);
      return;
    }
    setBusy(true);
    try {
      const result = branch
        ? await api<Branch>(
            `/admin/branches/${branch.id}`,
            { method: 'PATCH', body: JSON.stringify(parsed.data) },
            true,
          )
        : await post<Branch>('/admin/branches', parsed.data, true);
      await client.invalidateQueries({ queryKey: ['management'] });
      await client.invalidateQueries({ queryKey: ['branches'] });
      onSaved(result);
    } catch (err) {
      setError(errorMessage(err));
      if (!branch && err instanceof ApiError && (err.status === 0 || err.status >= 500))
        setUncertain(true);
      await client.invalidateQueries({ queryKey: ['management'] });
      await client.invalidateQueries({ queryKey: ['branches'] });
    } finally {
      setBusy(false);
    }
  };
  const disabled = busy || uncertain;
  return (
    <form
      onSubmit={submit}
      noValidate
      aria-label={branch ? 'Editar sucursal' : 'Crear sucursal'}
      className="mt-5 space-y-4 rounded-2xl border border-primary/40 bg-card p-5"
    >
      <h3 className="text-xl font-semibold">{branch ? 'Editar sucursal' : 'Crear sucursal'}</h3>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre de la sucursal" htmlFor="branch-name" error={errors.name}>
          <input
            autoFocus
            id="branch-name"
            className={inputClass}
            value={name}
            maxLength={100}
            disabled={disabled}
            aria-invalid={!!errors.name}
            aria-describedby={errors.name ? 'branch-name-error' : undefined}
            onChange={(e) => {
              setName(e.target.value);
              setConfirm(false);
            }}
          />
        </Field>
        <Field label="Dirección" htmlFor="branch-address" error={errors.address}>
          <input
            id="branch-address"
            className={inputClass}
            value={address}
            maxLength={255}
            disabled={disabled}
            aria-invalid={!!errors.address}
            aria-describedby={errors.address ? 'branch-address-error' : undefined}
            onChange={(e) => {
              setAddress(e.target.value);
              setConfirm(false);
            }}
          />
        </Field>
        <Field label="Teléfono (opcional)" htmlFor="branch-phone" error={errors.phone}>
          <input
            id="branch-phone"
            type="tel"
            className={inputClass}
            value={phone}
            disabled={disabled}
            aria-invalid={!!errors.phone}
            aria-describedby={errors.phone ? 'branch-phone-error' : undefined}
            onChange={(e) => {
              setPhone(e.target.value);
              setConfirm(false);
            }}
          />
        </Field>
      </div>
      <details>
        <summary className="cursor-pointer text-sm font-medium">Coordenadas opcionales</summary>
        <p className="mt-2 text-sm text-muted-foreground">
          Completá latitud y longitud juntas. No es necesario contratar un servicio de mapas.
        </p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <Field label="Latitud" htmlFor="branch-lat" error={errors.latitude}>
            <input
              id="branch-lat"
              type="number"
              step="any"
              min={-90}
              max={90}
              className={inputClass}
              value={latitude}
              disabled={disabled}
              onChange={(e) => {
                setLatitude(e.target.value);
                setConfirm(false);
              }}
            />
          </Field>
          <Field label="Longitud" htmlFor="branch-lng" error={errors.longitude}>
            <input
              id="branch-lng"
              type="number"
              step="any"
              min={-180}
              max={180}
              className={inputClass}
              value={longitude}
              disabled={disabled}
              onChange={(e) => {
                setLongitude(e.target.value);
                setConfirm(false);
              }}
            />
          </Field>
        </div>
      </details>
      {(errors.latitude || errors.longitude) && (
        <Notice tone="error">
          Revisá las coordenadas opcionales: {errors.latitude ?? errors.longitude}
        </Notice>
      )}
      <label className="flex items-center gap-3 text-sm font-medium">
        <input
          type="checkbox"
          checked={active}
          disabled={disabled}
          onChange={(e) => {
            setActive(e.target.checked);
            setConfirm(false);
          }}
          className="size-4"
        />
        Sucursal activa
      </label>
      {!active && (
        <p className="text-sm text-muted-foreground">
          Una sucursal inactiva sale del catálogo y de la agenda del personal. Conserva su historial
          y asignaciones.
        </p>
      )}
      {confirm && (
        <Notice tone="warning" title="Confirmá la desactivación">
          La API impedirá desactivarla si tiene reservas confirmadas o asistencias con horario de
          finalización pendiente.
        </Notice>
      )}
      {error && <Notice tone="error">{error}</Notice>}
      {uncertain && (
        <Notice tone="warning" title="No pudimos confirmar si se creó">
          Cerrá este formulario y revisá la lista antes de crear otra sucursal. No volvemos a enviar
          el alta automáticamente.
        </Notice>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" loading={busy} disabled={uncertain}>
          {confirm ? 'Confirmar desactivación' : branch ? 'Guardar cambios' : 'Crear sucursal'}
        </Button>
        <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
          {uncertain ? 'Cerrar y revisar sucursales' : 'Cancelar edición'}
        </Button>
      </div>
    </form>
  );
}

import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errorMessage, type Branch } from '@/lib/api';
import { useStore } from '@/lib/store';
import { hero } from '@/lib/presentation';
import { Button, Field, Notice, inputClass } from '@/components/kit';

export function BranchPhoto({ branch }: { branch: Branch }) {
  const { user } = useStore();
  const client = useQueryClient();
  const [file, setFile] = useState<File | null>(null),
    [preview, setPreview] = useState(''),
    [stored, setStored] = useState('');
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [success, setSuccess] = useState(''),
    [removing, setRemoving] = useState(false),
    [inputKey, setInputKey] = useState(0);
  const query = useQuery({
    queryKey: ['management', user?.id, 'branch-photo', branch.id, branch.imageVersion],
    queryFn: () => api<Blob>(`/admin/branches/${branch.id}/image`, {}, true, 'blob'),
    enabled: !!branch.imageVersion,
    retry: false,
  });
  useEffect(() => {
    if (!query.data || !branch.imageVersion) {
      setStored('');
      return;
    }
    const url = URL.createObjectURL(query.data);
    setStored(url);
    return () => URL.revokeObjectURL(url);
  }, [query.data, branch.imageVersion]);
  useEffect(() => {
    if (!file) {
      setPreview('');
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const save = async (remove = false) => {
    if (busy || (!remove && !file)) return;
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const body = new FormData();
      if (file) body.append('file', file);
      await api(
        `/admin/branches/${branch.id}/image`,
        remove ? { method: 'DELETE' } : { method: 'POST', body },
        true,
      );
      setFile(null);
      setInputKey((n) => n + 1);
      setRemoving(false);
      setSuccess(
        remove
          ? 'Imagen quitada. Se usará la imagen general.'
          : 'Imagen guardada. Ya se muestra en el inicio.',
      );
    } catch (err) {
      setError(
        `${errorMessage(err)} Consultá la vista previa antes de volver a cambiar la imagen.`,
      );
    } finally {
      await client.invalidateQueries({ queryKey: ['management'] });
      await client.invalidateQueries({ queryKey: ['branches'] });
      setBusy(false);
    }
  };
  return (
    <div className="mt-5 border-t border-border pt-4">
      <h4 className="font-semibold">Imagen del inicio</h4>
      <img
        src={preview || stored || hero}
        alt={`Vista previa de ${branch.name}`}
        className="mt-3 aspect-[4/3] w-full rounded-xl object-cover"
      />
      {query.isPending && branch.imageVersion && (
        <p className="mt-2 text-sm">Cargando imagen guardada…</p>
      )}
      {query.error && (
        <Notice
          tone="error"
          action={
            <Button
              size="sm"
              variant="secondary"
              type="button"
              onClick={() => void query.refetch()}
            >
              Reintentar vista previa
            </Button>
          }
        >
          No pudimos cargar la imagen guardada.
        </Notice>
      )}
      <div className="mt-3">
        <Field
          label={`Elegir imagen para ${branch.name}`}
          htmlFor={`branch-photo-${branch.id}`}
          hint="JPG, PNG o WebP, hasta 2 MB. Se recorta visualmente a formato 4:3."
        >
          <input
            key={inputKey}
            id={`branch-photo-${branch.id}`}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className={`${inputClass} h-auto py-2 text-sm`}
            disabled={busy}
            onChange={(event) => {
              setError('');
              setSuccess('');
              setRemoving(false);
              const selected = event.target.files?.[0];
              if (!selected) {
                setFile(null);
                return;
              }
              if (
                !['image/jpeg', 'image/png', 'image/webp'].includes(selected.type) ||
                selected.size > 2 * 1024 * 1024 ||
                selected.size === 0
              ) {
                setFile(null);
                setInputKey((n) => n + 1);
                setError('Elegí una imagen JPG, PNG o WebP de hasta 2 MB.');
                return;
              }
              setFile(selected);
            }}
          />
        </Field>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          size="sm"
          type="button"
          loading={busy}
          disabled={!file || removing}
          onClick={() => void save()}
        >
          Guardar imagen
        </Button>
        {file && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => {
              setFile(null);
              setInputKey((n) => n + 1);
            }}
          >
            Descartar selección
          </Button>
        )}
        {branch.imageVersion && (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={busy}
            onClick={() => setRemoving(true)}
          >
            Quitar imagen
          </Button>
        )}
      </div>
      {removing && (
        <div className="mt-3 space-y-2">
          <Notice title="¿Quitás la imagen de esta sucursal?">
            Se volverá a mostrar la imagen general.
          </Notice>
          <Button type="button" size="sm" disabled={busy} onClick={() => void save(true)}>
            Confirmar quitar imagen
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={busy}
            onClick={() => setRemoving(false)}
          >
            Volver
          </Button>
        </div>
      )}
      {error && (
        <div className="mt-3">
          <Notice tone="error">{error}</Notice>
        </div>
      )}
      {success && (
        <div className="mt-3">
          <Notice tone="success">{success}</Notice>
        </div>
      )}
    </div>
  );
}

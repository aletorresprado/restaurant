import { useEffect, useState, type FormEvent } from 'react';
import { Link } from '@tanstack/react-router';
import { ResetPasswordSchema } from '@repo/validation';
import { Button, Container, Field, Notice, inputClass } from '@/components/kit';
import { post, errorMessage, getSession, getSessionIdentity, api, setSession, type User } from '@/lib/api';

export function AccountConfirmation({ verification = false }: { verification?: boolean }) {
  const [token, setToken] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get('token') ?? '');
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('');
  useEffect(() => {
    // Remove the secret from the address/history. It is never sent in a GET or persisted in storage.
    window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
    const receiveLink = () => {
      setToken(new URLSearchParams(window.location.hash.slice(1)).get('token') ?? '');
      setMessage(''); setError('');
      window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
    };
    window.addEventListener('hashchange', receiveLink);
    return () => window.removeEventListener('hashchange', receiveLink);
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (busy || message) return;
    setError('');
    const body = { token, ...Object.fromEntries(new FormData(event.currentTarget)) };
    if (!verification) {
      const parsed = ResetPasswordSchema.safeParse(body);
      if (!parsed.success) { setError(parsed.error.issues[0].message); return; }
    }
    setBusy(true);
    const identity = getSessionIdentity();
    try {
      const result = await post<{ message: string }>(verification ? '/auth/verify-email' : '/auth/reset-password', body);
      setMessage(result.message);
      if (identity === getSessionIdentity()) {
        if (getSession()) {
          const user = await api<User>('/auth/me', {}, true).catch(() => null);
          if (user && identity === getSessionIdentity()) setSession({ user }, true);
        }
      }
    } catch (error) { setError(errorMessage(error)); }
    finally { setBusy(false); }
  }
  return <Container className="max-w-md py-10">
    <h1 className="text-3xl font-semibold">{verification ? 'Confirmá tu correo' : 'Elegí tu nueva contraseña'}</h1>
    <p className="mt-3 text-muted-foreground">El enlace se utiliza una sola vez. {verification ? 'Confirmá para verificar la dirección.' : 'Al guardar se cerrarán las sesiones anteriores y tendrás que ingresar de nuevo.'}</p>
    {!/^[a-f0-9]{64}$/.test(token) ? <div className="mt-6"><Notice tone="error" title="Falta un enlace válido">Abrí el enlace del correo. Si recargaste esta página, volvé a abrirlo desde el mensaje.</Notice></div> :
      <form onSubmit={submit} className="mt-6 space-y-5">
        {error && <Notice tone="error" title="No pudimos confirmar">{error}</Notice>}
        {message && <Notice title="Operación completada">{message}</Notice>}
        {!verification && !message && <>{[['password', 'Nueva contraseña'], ['confirmPassword', 'Confirmar contraseña']].map(([name, label]) =>
          <Field key={name} label={label} htmlFor={name}><input id={name} name={name} type="password" autoComplete="new-password" required disabled={busy} className={inputClass} /></Field>)}</>}
        {!message && <Button type="submit" loading={busy}>{verification ? 'Confirmar correo' : 'Guardar contraseña'}</Button>}
      </form>}
    <div className="mt-6 flex flex-wrap gap-5"><Link to="/ingresar" className="underline">Volver a ingresar</Link>
      <Link to={verification ? '/correo' : '/recuperar'} className="underline">Solicitar otro enlace</Link></div>
  </Container>;
}

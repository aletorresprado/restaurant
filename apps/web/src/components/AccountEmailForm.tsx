import { useState, type FormEvent } from 'react';
import { Link } from '@tanstack/react-router';
import { AccountEmailSchema } from '@repo/validation';
import { Button, Container, Field, Notice, inputClass } from '@/components/kit';
import { post, errorMessage } from '@/lib/api';
import { useStore } from '@/lib/store';

export function AccountEmailForm({ verification = false }: { verification?: boolean }) {
  const { user } = useStore();
  const [email, setEmail] = useState(verification ? user?.email ?? '' : '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy) return;
    setError(''); setMessage('');
    const input = AccountEmailSchema.safeParse({ email });
    if (!input.success) { setError('Ingresá un correo válido.'); return; }
    setBusy(true);
    try {
      const result = await post<{ message: string }>(verification ? '/auth/request-email-verification' : '/auth/forgot-password', input.data);
      setMessage(result.message);
    } catch (error) { setError(errorMessage(error)); }
    finally { setBusy(false); }
  }
  return <Container className="max-w-md py-10">
    <h1 className="text-3xl font-semibold">{verification ? 'Verificá tu correo' : 'Recuperá tu contraseña'}</h1>
    <p className="mt-3 text-muted-foreground">Te enviaremos un enlace para {verification ? 'confirmar tu dirección de correo' : 'elegir una contraseña nueva'}. Si ya lo pediste, revisá spam antes de solicitar otro.</p>
    <form onSubmit={submit} className="mt-6 space-y-5">
      {error && <Notice tone="error" title="No pudimos completar la solicitud">{error}</Notice>}
      {message && <Notice title="Solicitud recibida">{message}</Notice>}
      <Field label="Email" htmlFor="account-email"><input id="account-email" type="email" autoComplete="email" required
        className={inputClass} disabled={busy} value={email} onChange={event => setEmail(event.target.value)} /></Field>
      <Button type="submit" loading={busy}>Enviar enlace</Button>
    </form>
    <Link to="/ingresar" className="mt-6 inline-block underline">Volver a ingresar</Link>
  </Container>;
}

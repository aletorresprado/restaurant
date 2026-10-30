import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useState, type FormEvent } from 'react';
import { LoginSchema, RegisterSchema } from '@repo/validation';
import { Button, Container, Field, Notice, Stepper, inputClass } from '@/components/kit';
import { useStore } from '@/lib/store';
import { errorMessage } from '@/lib/api';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
export const Route = createFileRoute('/ingresar')({
  validateSearch: (
    value: Record<string, unknown>,
  ): { continuar?: 'confirmar' | 'mis-reservas' } => ({
    continuar:
      value.continuar === 'confirmar' || value.continuar === 'mis-reservas'
        ? value.continuar
        : undefined,
  }),
  head: () => ({ meta: [{ title: 'Ingresá o creá tu cuenta — App Resto' }] }),
  component: Login,
});
function Login() {
  const { continuar } = Route.useSearch();
  const navigate = useNavigate();
  const { signIn, pending } = useStore();
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading) return;
    const body = Object.fromEntries(new FormData(event.currentTarget));
    if (body.phone === '') delete body.phone;
    const result = (mode === 'register' ? RegisterSchema : LoginSchema).safeParse(body);
    setErrors({});
    setError('');
    if (!result.success) {
      setErrors(
        Object.fromEntries(
          Object.entries(result.error.flatten().fieldErrors).map(([key, value]) => [
            key,
            value?.[0] ?? 'Revisá este dato',
          ]),
        ),
      );
      return;
    }
    setLoading(true);
    try {
      await signIn(mode, result.data);
      await navigate({ to: continuar === 'confirmar' && pending ? '/confirmar' : '/mis-reservas' });
    } catch (error) {
      setError(errorMessage(error));
    } finally {
      setLoading(false);
    }
  };
  const field = (
    name: string,
    label: string,
    type = 'text',
    autoComplete = name,
    hint?: string,
  ) => (
    <Field label={label} htmlFor={name} error={errors[name]} hint={hint}>
      <input
        id={name}
        name={name}
        type={type}
        autoComplete={autoComplete}
        className={inputClass}
        aria-invalid={!!errors[name]}
        aria-describedby={errors[name] ? `${name}-error` : hint ? `${name}-hint` : undefined}
        disabled={loading}
      />
    </Field>
  );
  return (
    <Container className="max-w-md py-10">
      {continuar === 'confirmar' && <Stepper current={1} />}
      <h1 className="mt-6 text-3xl font-semibold">
        {mode === 'login' ? 'Ingresá a tu cuenta' : 'Creá tu cuenta'}
      </h1>
      {pending && continuar === 'confirmar' && (
        <div className="mt-4">
          <Notice title="Guardamos tu selección">
            {formatDateTime(pending.startAt)} · {pending.partySize} personas. Al ingresar seguís con
            la confirmación.
          </Notice>
        </div>
      )}
      <div className="mt-6 flex rounded-full bg-muted p-1">
        {(['login', 'register'] as const).map((value) => (
          <button
            key={value}
            disabled={loading}
            onClick={() => {
              setMode(value);
              setErrors({});
              setError('');
            }}
            className={cn(
              'flex-1 rounded-full py-2 text-sm font-medium',
              mode === value ? 'bg-card shadow-sm' : 'text-muted-foreground',
            )}
          >
            {value === 'login' ? 'Ingresar' : 'Crear cuenta'}
          </button>
        ))}
      </div>
      <form key={mode} onSubmit={submit} noValidate className="mt-6 space-y-4">
        {error && (
          <Notice tone="error" title="No pudimos completar el acceso">
            {error}
          </Notice>
        )}
        {mode === 'register' && (
          <>
            {field('firstName', 'Nombre', 'text', 'given-name')}
            {field('lastName', 'Apellido', 'text', 'family-name')}
          </>
        )}
        {field('email', 'Email', 'email', 'email')}
        {mode === 'register' && field('phone', 'Teléfono (opcional)', 'tel', 'tel')}
        {field(
          'password',
          'Contraseña',
          'password',
          mode === 'register' ? 'new-password' : 'current-password',
          mode === 'register'
            ? 'Al menos 8 caracteres, una mayúscula y un número. Máximo 72 bytes.'
            : undefined,
        )}
        <Button type="submit" size="lg" className="w-full" loading={loading}>
          {loading ? 'Ingresando…' : mode === 'login' ? 'Ingresar' : 'Crear cuenta'}
        </Button>
      </form>
      {pending && (
        <p className="mt-6 text-center text-sm">
          <Link
            to="/reservar"
            search={{
              sucursal: pending.branchId,
              fecha: pending.serviceDate,
              personas: pending.partySize,
            }}
            className="underline underline-offset-2"
          >
            Volver a los horarios
          </Link>
        </p>
      )}
    </Container>
  );
}

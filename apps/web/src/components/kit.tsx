import { cva, type VariantProps } from 'class-variance-authority';
import { Link, useRouterState } from '@tanstack/react-router';
import {
  AlertTriangle,
  CheckCircle2,
  CircleSlash,
  Info,
  Loader2,
  XCircle,
  CalendarClock,
} from 'lucide-react';
import { useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { useStore, type ReservationStatus } from '@/lib/store';

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-full font-medium transition-[background,transform,box-shadow] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 select-none',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm',
        accent: 'bg-accent text-accent-foreground hover:bg-accent/90 shadow-sm',
        secondary: 'bg-card text-foreground border border-input hover:bg-secondary',
        ghost: 'text-foreground hover:bg-secondary',
        danger: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
        onPhoto: 'bg-on-photo text-foreground hover:bg-on-photo/90',
      },
      size: { sm: 'h-9 px-4 text-sm', md: 'h-11 px-5 text-[15px]', lg: 'h-13 px-7 text-base' },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & { loading?: boolean };
export function Button({ className, variant, size, loading, children, disabled, ...p }: BtnProps) {
  return (
    <button
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...p}
    >
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export function Container({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('mx-auto w-full max-w-5xl px-5 sm:px-8', className)}>{children}</div>;
}

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${htmlFor}-error`} className="flex items-center gap-1.5 text-sm text-destructive">
          <XCircle className="size-4" aria-hidden />
          {error}
        </p>
      ) : hint ? (
        <p id={`${htmlFor}-hint`} className="text-sm text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export const inputClass =
  'h-12 w-full rounded-lg border border-input bg-card px-3.5 text-[15px] outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20 aria-[invalid=true]:border-destructive';

const noticeStyles = {
  info: { cls: 'bg-primary-soft text-foreground', Icon: Info, iconCls: 'text-primary' },
  warning: { cls: 'bg-warning-soft text-foreground', Icon: AlertTriangle, iconCls: 'text-warning' },
  error: { cls: 'bg-destructive-soft text-foreground', Icon: XCircle, iconCls: 'text-destructive' },
  success: { cls: 'bg-success-soft text-foreground', Icon: CheckCircle2, iconCls: 'text-success' },
};
export function Notice({
  tone = 'info',
  title,
  children,
  action,
}: {
  tone?: keyof typeof noticeStyles;
  title?: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  const { cls, Icon, iconCls } = noticeStyles[tone];
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn('flex gap-3 rounded-xl p-4 text-sm fade-up', cls)}
    >
      <Icon className={cn('mt-0.5 size-5 shrink-0', iconCls)} aria-hidden />
      <div className="flex-1 space-y-1">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="text-foreground/80">{children}</div>}
        {action && <div className="pt-2">{action}</div>}
      </div>
    </div>
  );
}

const statusMap: Record<
  ReservationStatus | 'pasada',
  { label: string; cls: string; Icon: typeof Info }
> = {
  CONFIRMED: { label: 'Confirmada', cls: 'bg-success-soft text-success', Icon: CheckCircle2 },
  CANCELLED_BY_CUSTOMER: {
    label: 'Cancelada por vos',
    cls: 'bg-muted text-muted-foreground',
    Icon: CircleSlash,
  },
  CANCELLED_BY_RESTAURANT: {
    label: 'Cancelada por el restaurante',
    cls: 'bg-destructive-soft text-destructive',
    Icon: XCircle,
  },
  ATTENDED: {
    label: 'Asistencia registrada',
    cls: 'bg-success-soft text-success',
    Icon: CheckCircle2,
  },
  NO_SHOW: {
    label: 'Ausencia registrada',
    cls: 'bg-warning-soft text-warning',
    Icon: CalendarClock,
  },
  pasada: { label: 'Fecha pasada', cls: 'bg-muted text-muted-foreground', Icon: CalendarClock },
};
export function StatusBadge({ status }: { status: keyof typeof statusMap }) {
  const { label, cls, Icon } = statusMap[status];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold',
        cls,
      )}
    >
      <Icon className="size-3.5" aria-hidden />
      {label}
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-lg bg-muted', className)} aria-hidden />;
}

const steps = ['Horario', 'Tus datos', 'Confirmación'];
export function Stepper({ current }: { current: 0 | 1 | 2 }) {
  return (
    <ol
      className="flex items-center gap-2 text-xs font-medium text-muted-foreground"
      aria-label="Pasos de la reserva"
    >
      {steps.map((s, i) => (
        <li
          key={s}
          className="flex items-center gap-2"
          aria-current={i === current ? 'step' : undefined}
        >
          <span
            className={cn(
              'grid size-6 place-items-center rounded-full border',
              i < current && 'border-primary bg-primary text-primary-foreground',
              i === current && 'border-primary text-primary',
            )}
          >
            {i < current ? '✓' : i + 1}
          </span>
          <span className={cn(i === current && 'text-foreground')}>{s}</span>
          {i < steps.length - 1 && <span className="h-px w-4 bg-border sm:w-8" aria-hidden />}
        </li>
      ))}
    </ol>
  );
}

export function SiteHeader() {
  const { user, signOut } = useStore();
  const [exitError, setExitError] = useState('');
  const [exiting, setExiting] = useState(false);
  const exit = async () => {
    setExiting(true);
    setExitError('');
    try {
      await signOut();
    } catch {
      setExitError('No pudimos cerrar la sesión. Intentá nuevamente.');
    } finally {
      setExiting(false);
    }
  };
  const path = useRouterState({ select: (s) => s.location.pathname });
  return (
    <header className="sticky top-0 z-30 border-b border-border/70 bg-background/90 backdrop-blur">
      <Container className="flex h-16 items-center justify-between gap-4">
        <Link to="/" className="font-display text-xl font-semibold tracking-tight">
          App <span className="text-accent">Resto</span>
        </Link>
        <nav className="flex items-center gap-1 text-sm" aria-label="Principal">
          <Link
            to="/mis-reservas"
            className={cn(
              'rounded-full px-3 py-2 hover:bg-secondary',
              path.startsWith('/mis-reservas') && 'bg-secondary font-semibold',
            )}
          >
            Mis reservas
          </Link>
          {user ? (
            <button
              onClick={exit}
              disabled={exiting}
              className="rounded-full px-3 py-2 text-muted-foreground hover:bg-secondary"
            >
              {exiting ? 'Saliendo…' : `Salir (${user.firstName})`}
            </button>
          ) : (
            <Link
              to="/ingresar"
              className="rounded-full border border-input px-4 py-2 font-medium hover:bg-secondary"
            >
              Ingresar
            </Link>
          )}
        </nav>
      </Container>
      {exitError && (
        <Container>
          <p role="alert" className="pb-3 text-sm text-destructive">
            {exitError}
          </p>
        </Container>
      )}
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-20 border-t border-border py-8 text-sm text-muted-foreground">
      <Container className="flex flex-wrap items-center justify-between gap-3">
        <p>App Resto · Buena comida, buenos encuentros</p>
        <Link to="/" className="hover:text-foreground">
          Nuestras sucursales
        </Link>
      </Container>
    </footer>
  );
}

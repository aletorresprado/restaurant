import { createFileRoute } from '@tanstack/react-router';
import { AccountConfirmation } from '@/components/AccountConfirmation';
export const Route = createFileRoute('/verificar-correo')({ component: () => <AccountConfirmation verification /> });

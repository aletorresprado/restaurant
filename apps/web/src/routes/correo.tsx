import { createFileRoute } from '@tanstack/react-router';
import { AccountEmailForm } from '@/components/AccountEmailForm';
export const Route = createFileRoute('/correo')({ component: () => <AccountEmailForm verification /> });

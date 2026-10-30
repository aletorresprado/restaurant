import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import {
  api,
  getSession,
  logoutSession,
  onSessionChange,
  post,
  restoreSession,
  setSession,
  type Branch,
  type Page,
  type Session,
  type User,
} from './api';

const SelectionSchema = z.object({
  branchId: z.string().uuid(),
  serviceDate: z.string().date(),
  startAt: z.string().datetime({ offset: true }),
  endAt: z.string().datetime({ offset: true }),
  partySize: z.number().int().min(1).max(50),
});
export type Selection = z.infer<typeof SelectionSchema>;
export type ReservationStatus =
  'CONFIRMED' | 'CANCELLED_BY_CUSTOMER' | 'CANCELLED_BY_RESTAURANT' | 'ATTENDED' | 'NO_SHOW';
type Context = {
  user: User | null;
  ready: boolean;
  authError: string;
  pending: Selection | null;
  branches: Branch[];
  branchesLoading: boolean;
  branchesError: Error | null;
  reloadBranches: () => void;
  setPending: (selection: Selection | null) => void;
  signIn: (mode: 'login' | 'register', body: unknown) => Promise<void>;
  signOut: () => Promise<void>;
};
const Store = createContext<Context | null>(null);
export function StoreProvider({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  const [authError, setAuthError] = useState('');
  const [pending, setPendingValue] = useState<Selection | null>(null);
  useEffect(() => {
    const unsubscribe = onSessionChange(() => {
      setUser(getSession()?.user ?? null);
      client.removeQueries({
        predicate: (q) => q.queryKey[0] === 'reservations' || q.queryKey[0] === 'reservation',
      });
    });
    restoreSession();
    try {
      const value = SelectionSchema.safeParse(
        JSON.parse(sessionStorage.getItem('app-resto-selection') ?? 'null'),
      );
      if (value.success) setPendingValue(value.data);
    } catch {
      /* No persisted selection. */
    }
    if (!getSession()) {
      setReady(true);
      return unsubscribe;
    }
    api<User>('/auth/me', {}, true)
      .then((value) => {
        const session = getSession();
        if (session) setSession({ ...session, user: value });
      })
      .catch((error) => {
        if (getSession())
          setAuthError(error instanceof Error ? error.message : 'No se pudo verificar tu sesión.');
      })
      .finally(() => setReady(true));
    return unsubscribe;
  }, [client]);
  const branches = useQuery({
    queryKey: ['branches'],
    queryFn: async () => {
      const all: Branch[] = [];
      let page = 1,
        totalPages = 1;
      do {
        const response = await api<Page<Branch>>(`/branches?page=${page}&limit=100`);
        all.push(...response.data);
        totalPages = response.meta.totalPages;
        page++;
      } while (page <= totalPages);
      return all;
    },
    retry: 1,
    staleTime: 30000,
  });
  const setPending = useCallback((value: Selection | null) => {
    setPendingValue(value);
    try {
      value
        ? sessionStorage.setItem('app-resto-selection', JSON.stringify(value))
        : sessionStorage.removeItem('app-resto-selection');
    } catch {
      /* Selection remains in memory. */
    }
  }, []);
  const signIn = async (mode: 'login' | 'register', body: unknown) => {
    const session = await post<Session>(`/auth/${mode}`, body);
    client.clear();
    setSession(session);
    setAuthError('');
  };
  const signOut = async () => {
    await logoutSession();
    client.clear();
    setAuthError('');
  };
  return (
    <Store.Provider
      value={{
        user,
        ready,
        authError,
        pending,
        setPending,
        signIn,
        signOut,
        branches: branches.data ?? [],
        branchesLoading: branches.isPending,
        branchesError: branches.error,
        reloadBranches: () => {
          void branches.refetch();
        },
      }}
    >
      {children}
    </Store.Provider>
  );
}
export function useStore() {
  const value = useContext(Store);
  if (!value) throw new Error('Falta StoreProvider');
  return value;
}

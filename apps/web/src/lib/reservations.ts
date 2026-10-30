import { useQuery } from '@tanstack/react-query';
import { api, type Page, type Reservation } from './api';
import { useStore } from './store';
export function useReservation(id: string) {
  const { user, ready } = useStore();
  return useQuery({
    queryKey: ['reservation', user?.id, id],
    queryFn: () => api<Reservation>(`/reservations/${id}`, {}, true),
    enabled: ready && !!user,
    retry: false,
    staleTime: 0,
  });
}
export const reservationPage = (page: number) =>
  api<Page<Reservation>>(`/reservations?page=${page}&limit=20`, {}, true);

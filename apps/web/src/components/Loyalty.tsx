import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { BUSINESS_CONFIG } from '@repo/config';
import { api, post, errorMessage, type Page } from '@/lib/api';
import { useStore } from '@/lib/store';
import { formatDateTime } from '@/lib/format';
import { Button, Notice, inputClass } from './kit';

type Movement = { id: string; kind: string; requestedPoints: number; points: number; balanceAfter: number; reason: string | null; createdAt: string };
const names: Record<string, string> = { ATTENDANCE: 'Asistencia', NO_SHOW: 'Ausencia', SURVEY: 'Encuesta', ADJUSTMENT: 'Ajuste administrativo' };
export function LoyaltyPanel() {
  const { user, ready } = useStore();
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [user?.id]);
  const summary = useQuery({ queryKey: ['loyalty', user?.id, 'summary'], queryFn: () => api<{ balance: number; tier: string }>('/loyalty/me', {}, true), enabled: ready && !!user, retry: false });
  const history = useQuery({ queryKey: ['loyalty', user?.id, page], queryFn: () => api<Page<Movement>>(`/loyalty/me/movements?page=${page}&limit=5`, {}, true), enabled: ready && !!user, retry: false });
  if (!user) return null;
  return <section className="mt-6 rounded-2xl border border-border bg-card p-5" aria-label="Mis puntos">
    <h2 className="text-xl font-semibold">Mis puntos</h2>
    {summary.isPending ? <p>Cargando saldo…</p> : summary.error ? <Notice tone="error" action={<Button onClick={() => void summary.refetch()}>Reintentar</Button>}>{summary.error.message}</Notice> : <p className="mt-2 text-lg">{summary.data?.balance} puntos · Nivel {summary.data?.tier}</p>}
    <p className="mt-2 text-sm text-muted-foreground">Asistencia +{BUSINESS_CONFIG.loyalty.attendanceReward} · Encuesta +{BUSINESS_CONFIG.loyalty.surveyReward} · Ausencia −{BUSINESS_CONFIG.loyalty.noShowPenalty}. El saldo nunca baja de cero.</p>
    {history.isPending ? <p className="mt-3">Cargando movimientos…</p> : history.error ? <Notice tone="error" action={<Button onClick={() => void history.refetch()}>Reintentar</Button>}>{history.error.message}</Notice> : <>
      <ul className="mt-4 space-y-3">{history.data?.data.map(item => <li key={item.id} className="border-t border-border pt-3 text-sm"><p className="font-medium">{names[item.kind] ?? item.kind}: {item.points > 0 ? '+' : ''}{item.points} · Saldo {item.balanceAfter}</p><p className="text-muted-foreground">{formatDateTime(item.createdAt)}{item.reason ? ` · ${item.reason}` : ''}</p>{item.points !== item.requestedPoints && <p>Se aplicó el límite de saldo mínimo.</p>}</li>)}</ul>
      {!history.data?.data.length && <p className="mt-3 text-sm">Todavía no tenés movimientos.</p>}
      <div className="mt-4 flex items-center justify-between gap-2"><Button size="sm" variant="secondary" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Anterior</Button><span className="text-sm">Página {page}</span><Button size="sm" variant="secondary" disabled={page >= (history.data?.meta.totalPages ?? 0)} onClick={() => setPage(p => p + 1)}>Siguiente</Button></div>
    </>}
  </section>;
}

export function ReservationSurvey({ id }: { id: string }) {
  const { user } = useStore();
  const client = useQueryClient();
  const [rating, setRating] = useState(5), [sending, setSending] = useState(false), [error, setError] = useState('');
  const query = useQuery({ queryKey: ['loyalty', user?.id, 'survey', id], queryFn: () => api<{ submitted: boolean; eligible: boolean; rating: number | null }>(`/loyalty/reservations/${id}/survey`, {}, true), enabled: !!user && user.role === 'CUSTOMER', retry: false, refetchInterval: 30000 });
  if (!user || user.role !== 'CUSTOMER') return null;
  if (query.error) return <Notice tone="error" title="No pudimos consultar la encuesta" action={<Button onClick={() => void query.refetch()}>Reintentar</Button>}>{query.error.message}</Notice>;
  if (!query.data?.eligible) return null;
  if (query.data.submitted) return <Notice tone="success" title="Gracias por responder">Tu calificación: {query.data.rating}/5. La recompensa ya está registrada en tus puntos.</Notice>;
  return <section className="rounded-xl border border-border p-4"><h2 className="text-xl">¿Cómo fue tu visita?</h2><p className="mt-2 text-sm">Respondé esta encuesta y sumá {BUSINESS_CONFIG.loyalty.surveyReward} puntos una sola vez.</p><label htmlFor="survey-rating" className="mt-3 block text-sm">Calificación (1: mala, 5: excelente)</label><select id="survey-rating" className={`${inputClass} mt-2`} value={rating} disabled={sending} onChange={e => setRating(Number(e.target.value))}>{[1,2,3,4,5].map(n => <option key={n} value={n}>{n}</option>)}</select>{error && <Notice tone="error">{error}</Notice>}<Button className="mt-3" disabled={sending} onClick={async () => { setSending(true); setError(''); try { await post(`/loyalty/reservations/${id}/survey`, { rating }, true); await client.invalidateQueries({ queryKey: ['loyalty'] }); } catch (err) { setError(errorMessage(err)); await query.refetch(); } finally { setSending(false); } }}>Enviar encuesta</Button></section>;
}

import { CalendarDays, Clock, MapPin, Users, Armchair } from 'lucide-react';
import { useStore } from '@/lib/store';
import { dateLabel, formatDateTime, hhmm, restaurantDate } from '@/lib/format';
import { hero } from '@/lib/presentation';
export function ReservationSummary({
  branchId,
  serviceDate,
  startAt,
  endAt,
  partySize,
  branch,
  table,
}: {
  branchId: string;
  serviceDate: string;
  startAt: string;
  endAt: string;
  partySize: number;
  branch?: { name: string; address: string };
  table?: { tableNumber: string };
}) {
  const { branches } = useStore();
  const data = branch ?? branches.find((b) => b.id === branchId);
  const rows = [
    {
      Icon: MapPin,
      label: 'Sucursal',
      value: data ? `${data.name} · ${data.address}` : 'Sucursal seleccionada',
    },
    { Icon: CalendarDays, label: 'Fecha', value: formatDateTime(startAt) },
    {
      Icon: Clock,
      label: 'Horario',
      value: `${hhmm(startAt)} a ${hhmm(endAt)} h · ${Math.round((Date.parse(endAt) - Date.parse(startAt)) / 60000)} min`,
    },
    {
      Icon: Users,
      label: 'Personas',
      value: `${partySize} ${partySize === 1 ? 'persona' : 'personas'}`,
    },
    {
      Icon: Armchair,
      label: 'Mesa',
      value: table ? `Mesa ${table.tableNumber}` : 'Asignación automática al confirmar',
    },
  ];
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card">
      <img src={hero} alt="" className="h-28 w-full object-cover" />
      <dl className="divide-y divide-border">
        {rows.map(({ Icon, label, value }) => (
          <div key={label} className="flex items-start gap-3 px-5 py-3.5 text-sm">
            <Icon className="mt-0.5 size-4 shrink-0 text-primary" />
            <dt className="w-20 shrink-0 text-muted-foreground">{label}</dt>
            <dd className="font-medium">{value}</dd>
          </div>
        ))}
      </dl>
      {restaurantDate(new Date(startAt)) !== serviceDate && (
        <p className="border-t border-border bg-warning-soft px-5 py-3 text-sm">
          Este horario corresponde al servicio del {dateLabel(serviceDate)}, que continúa después de
          medianoche.
        </p>
      )}
    </div>
  );
}

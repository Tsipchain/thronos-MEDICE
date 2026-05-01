import clsx from 'clsx';

type Status = 'ok' | 'warn' | 'critical' | 'unknown';

const CARD: Record<Status, string> = {
  ok:       'bg-green-50  border-green-200',
  warn:     'bg-orange-50 border-orange-200',
  critical: 'bg-red-50    border-red-200',
  unknown:  'bg-slate-50  border-slate-200',
};
const VALUE: Record<Status, string> = {
  ok:       'text-green-700',
  warn:     'text-orange-700',
  critical: 'text-red-700',
  unknown:  'text-slate-400',
};

export default function VitalCard({
  icon, title, value, status, subLabel,
}: {
  icon: string; title: string;
  value: string | null;
  status: Status;
  subLabel: string;
}) {
  return (
    <div className={clsx('rounded-2xl border p-5 transition', CARD[status])}>
      <div className="text-sm font-medium mb-3 text-slate-600">{icon} {title}</div>
      <div className={clsx('text-4xl font-bold', VALUE[status])}>
        {value ?? '—'}
      </div>
      <div className="text-xs mt-2 text-slate-500">{subLabel}</div>
    </div>
  );
}

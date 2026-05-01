function fmt(iso: string) {
  return new Date(iso).toLocaleString('el-GR', {
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

export default function FeverHistoryTable({
  history, loading,
}: {
  history: any[]; loading: boolean;
}) {
  if (loading) return <p className="text-sm text-slate-400">Φόρτωση...</p>;
  if (!history.length)
    return <p className="text-sm text-slate-400">Δεν υπάρχει ιστορικό πυρετών ακόμη.</p>;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-slate-400 border-b border-slate-100 text-xs uppercase tracking-wide">
            {['Έναρξη','Λήξη','Αιχμή °C','Min SpO₂','Μέσο BPM','Blockchain']
              .map(h => <th key={h} className="pb-2 pr-6 font-medium">{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {history.map((e: any) => (
            <tr key={e.id} className="border-b border-slate-50 hover:bg-slate-50 transition">
              <td className="py-2.5 pr-6">{fmt(e.start_time)}</td>
              <td className="py-2.5 pr-6">{e.end_time ? fmt(e.end_time) : '—'}</td>
              <td className="py-2.5 pr-6 font-semibold text-orange-600">{e.peak_temp.toFixed(1)}</td>
              <td className="py-2.5 pr-6">{e.min_spo2 ? `${Math.round(e.min_spo2)}%` : '—'}</td>
              <td className="py-2.5 pr-6">{e.avg_bpm  ? Math.round(e.avg_bpm)        : '—'}</td>
              <td className="py-2.5">
                {e.blockchain_tx
                  ? <span className="text-xs bg-green-50 text-green-700 border border-green-200 px-2 py-0.5 rounded-full">✓ On-chain</span>
                  : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

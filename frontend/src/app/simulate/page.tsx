'use client';
import { useState } from 'react';
import Link from 'next/link';
import { simulate } from '@/lib/api';

const LEVEL_COLOR: Record<string,string> = {
  normal:      'text-green-700  bg-green-50  border-green-200',
  elevated:    'text-yellow-700 bg-yellow-50 border-yellow-200',
  high_stage1: 'text-orange-700 bg-orange-50 border-orange-200',
  high_stage2: 'text-red-600    bg-red-50    border-red-200',
  crisis:      'text-red-800    bg-red-100   border-red-300',
  low:         'text-blue-700   bg-blue-50   border-blue-200',
  fever:       'text-orange-700 bg-orange-50 border-orange-200',
  high_fever:  'text-red-700    bg-red-50    border-red-200',
  bradycardia: 'text-blue-700   bg-blue-50   border-blue-200',
  tachycardia: 'text-orange-700 bg-orange-50 border-orange-200',
  ok:          'text-green-700  bg-green-50  border-green-200',
  unknown:     'text-slate-500  bg-slate-50  border-slate-200',
};

export default function SimulatePage() {
  const [temp,    setTemp]    = useState('37.2');
  const [spo2,    setSpo2]    = useState('97');
  const [bpm,     setBpm]     = useState('75');
  const [sys,     setSys]     = useState('');
  const [dia,     setDia]     = useState('');
  const [result,  setResult]  = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');

  const run = async () => {
    setLoading(true); setError(''); setResult(null);
    try {
      const data = await simulate({
        temperature: parseFloat(temp),
        spo2:      spo2 ? parseFloat(spo2) : undefined,
        bpm:       bpm  ? parseInt(bpm)    : undefined,
        systolic:  sys  ? parseInt(sys)    : undefined,
        diastolic: dia  ? parseInt(dia)    : undefined,
      });
      setResult(data);
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="bg-slate-800 text-white px-6 py-3 flex items-center justify-between">
        <span className="font-bold text-lg">🏥 ThronomedICE</span>
        <div className="flex gap-6 text-sm">
          <Link href="/dashboard" className="text-slate-400 hover:text-white transition">Dashboard</Link>
          <span className="text-slate-200 font-medium">Προσομοίωση</span>
        </div>
      </nav>

      <div className="max-w-2xl mx-auto px-4 py-10">
        <h1 className="text-2xl font-bold text-slate-800 mb-1">🧪 Προσομοίωση Μετρήσεων</h1>
        <p className="text-slate-500 text-sm mb-8">Δοκιμή ανάλυσης χωρίς φυσική συσκευή — δεν αποθηκεύεται.</p>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <div className="grid grid-cols-2 gap-4 mb-4">
            <F label="🌡️ Θερμοκρασία (°C) *" v={temp} set={setTemp} ph="37.2" />
            <F label="🧠 SpO₂ (%)"              v={spo2} set={setSpo2} ph="97" />
            <F label="❤️ Καρδιακοί Παλμοί (bpm)"  v={bpm}  set={setBpm}  ph="75" />
            <div />
            <F label="💓 Συστολική (mmHg)"   v={sys}  set={setSys}  ph="120" />
            <F label="💓 Διαστολική (mmHg)"  v={dia}  set={setDia}  ph="80" />
          </div>
          {error && <p className="text-red-500 text-sm mb-3">{error}</p>}
          <button onClick={run} disabled={loading || !temp}
            className="w-full bg-slate-800 text-white py-3 rounded-xl font-semibold hover:bg-slate-700 disabled:opacity-50 transition">
            {loading ? 'Ανάλυση...' : 'Εκτέλεση Ανάλυσης'}
          </button>
        </div>

        {result && (
          <div className="mt-6 bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <h2 className="text-base font-semibold text-slate-700 mb-4">Αποτέλεσμα Ανάλυσης</h2>
            <div className="grid grid-cols-2 gap-3">
              {[
                ['Θερμοκρασία', result.fever_level],
                ['SpO₂',        result.spo2_level],
                ['Καρδιακοί',  result.hr_level],
                ['Πίεση',        result.bp_level],
              ].map(([label, val]) => (
                <div key={label} className="flex items-center justify-between border border-slate-100 rounded-xl p-3">
                  <span className="text-xs text-slate-500">{label}</span>
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${
                    LEVEL_COLOR[val] || LEVEL_COLOR.unknown}`}>{val}</span>
                </div>
              ))}
            </div>
            <details className="mt-4">
              <summary className="text-xs text-slate-400 cursor-pointer">Πλήρης απάντηση API</summary>
              <pre className="mt-2 bg-slate-50 rounded-lg p-3 text-xs overflow-auto">
                {JSON.stringify(result, null, 2)}
              </pre>
            </details>
          </div>
        )}
      </div>
    </div>
  );
}

function F({ label, v, set, ph }: { label: string; v: string; set: (x: string) => void; ph: string }) {
  return (
    <div>
      <label className="block text-xs text-slate-500 mb-1">{label}</label>
      <input type="number" value={v} onChange={e => set(e.target.value)} placeholder={ph} step="0.1"
        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300" />
    </div>
  );
}

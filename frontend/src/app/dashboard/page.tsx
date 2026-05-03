'use client';
import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import Link from 'next/link';
import { getVitals, getFeverHistory, getPatientPlan, getPatientDevices } from '@/lib/api';
import VitalCard from '@/components/VitalCard';
import FeverHistoryTable from '@/components/FeverHistoryTable';

type BpLevel = 'normal'|'elevated'|'high_stage1'|'high_stage2'|'crisis'|'low'|'unknown';

function classifyBP(s: number|null, d: number|null, valid: boolean): BpLevel {
  if (!valid || s === null || d === null) return 'unknown';
  if (s > 180 || d > 120) return 'crisis';
  if (s >= 140 || d >= 90)  return 'high_stage2';
  if (s >= 130 || d >= 80)  return 'high_stage1';
  if (s < 90  || d < 60)    return 'low';
  if (s >= 120)              return 'elevated';
  return 'normal';
}

const BP_LABEL: Record<BpLevel,string> = {
  crisis:'🚨 Υπερτασική Κρίση', high_stage2:'⚠️ Υψηλή Β΄ Στ.',
  high_stage1:'⚠️ Υψηλή Α΄ Στ.', elevated:'↑ Ανυψωμένη',
  low:'↓ Χαμηλή', normal:'✅ Κανονική', unknown:'— Αναμονή',
};
const BP_COLOR: Record<BpLevel,string> = {
  crisis:'bg-red-50 border-red-300 text-red-800',
  high_stage2:'bg-orange-50 border-orange-300 text-orange-800',
  high_stage1:'bg-amber-50 border-amber-300 text-amber-800',
  elevated:'bg-yellow-50 border-yellow-200 text-yellow-700',
  low:'bg-blue-50 border-blue-300 text-blue-800',
  normal:'bg-green-50 border-green-300 text-green-800',
  unknown:'bg-slate-50 border-slate-200 text-slate-400',
};

function DashboardContent() {
  const router = useRouter();
  const params = useSearchParams();
  const [patient,  setPatient]  = useState<any>(null);
  const [guardian, setGuardian] = useState<any>(null);
  const [ready,    setReady]    = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  useEffect(() => {
    const p = localStorage.getItem('medice_patient');
    const g = localStorage.getItem('medice_guardian');
    if (!p) { router.replace('/login'); return; }
    setPatient(JSON.parse(p));
    if (g) setGuardian(JSON.parse(g));
    setReady(true);

    // Show success message if returning from Stripe
    if (params.get('success')) {
      setSuccessMsg('✅ Συνδρομή ενεργοποιήθηκε!');
      setTimeout(() => setSuccessMsg(''), 5000);
    }
  }, [router, params]);

  const { data: vitals, error: vErr, isLoading, mutate } = useSWR(
    ready ? ['v', patient?.id] : null,
    () => getVitals(patient.id),
    { refreshInterval: 30_000 },
  );
  const { data: history } = useSWR(
    ready ? ['h', patient?.id] : null,
    () => getFeverHistory(patient.id),
    { refreshInterval: 60_000 },
  );
  const { data: plan } = useSWR(
    ready ? ['plan', patient?.id] : null,
    () => getPatientPlan(patient.id),
    { refreshInterval: 0 },
  );
  const { data: devices } = useSWR(
    ready ? ['devices', patient?.id] : null,
    () => getPatientDevices(patient.id),
    { refreshInterval: 30_000 },
  );

  if (!ready) return null;

  const temp  = vitals?.temperature ?? null;
  const fever_rate = vitals?.fever_rate ?? null;  // °C per minute
  const rapid_rise = vitals?.rapid_rise ?? false;
  const spo2  = vitals?.spo2        ?? null;
  const bpm   = vitals?.bpm         ?? null;
  const sys   = vitals?.systolic    ?? null;
  const dia   = vitals?.diastolic   ?? null;
  const bpOk  = vitals?.bp_valid    ?? false;
  const ts    = vitals?.timestamp   ? new Date(vitals.timestamp) : null;

  const isHighFever = temp !== null && temp >= 39.0;
  const isFever     = temp !== null && temp >= 38.0;
  const isSpo2Crit  = spo2 !== null && spo2 < 90;
  const isSpo2Low   = spo2 !== null && spo2 < 94;
  const isHRAbnorm  = bpm  !== null && (bpm < 60 || bpm > 130);
  const bpLevel     = classifyBP(sys, dia, bpOk);

  const subLabel = plan?.in_trial
    ? `🎁 Trial — ${plan.trial_days_left} μέρες απομένουν`
    : plan?.subscription === 'bp' ? '💓 Πλήρης (με Πίεση)' : '🌡️ Βασική';

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="bg-slate-800 text-white px-6 py-3 flex items-center justify-between">
        <span className="font-bold text-lg">🏥 ThronomedICE</span>
        <div className="flex gap-6 text-sm items-center">
          <span className="text-slate-200 font-medium">Dashboard</span>
          <Link href="/simulate" className="text-slate-400 hover:text-white transition">Προσομοίωση</Link>
          <Link href="/connect" className="text-slate-400 hover:text-white transition">Συσκευή</Link>
          {guardian && (
            <span className="text-slate-400 text-xs hidden sm:block">👤 {guardian.name}</span>
          )}
        </div>
        <button onClick={() => { localStorage.clear(); router.replace('/login'); }}
          className="text-slate-400 hover:text-white text-sm transition">Αποσύνδεση</button>
      </nav>

      <div className="max-w-5xl mx-auto px-4 py-8">
        {successMsg && (
          <div className="bg-green-100 border border-green-300 text-green-800 rounded-xl p-3 mb-6 text-sm">
            {successMsg}
          </div>
        )}

        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-800">{patient?.name}</h1>
            <div className="flex items-center gap-3 mt-0.5">
              {ts && <p className="text-sm text-slate-400">Τελευταία: {ts.toLocaleTimeString('el-GR')}</p>}
              {plan && (
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                  plan.in_trial
                    ? 'bg-green-100 text-green-700'
                    : plan.subscription === 'bp'
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-slate-100 text-slate-600'
                }`}>
                  {subLabel}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5 text-xs text-green-600 bg-green-50 border border-green-200 px-3 py-1 rounded-full">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse inline-block" />
              Ανανέωση 30s
            </span>
            <button onClick={() => mutate()}
              className="text-sm border border-slate-200 px-3 py-1 rounded-lg hover:bg-white transition">
              ↻ Ανανέωση
            </button>
          </div>
        </div>

        {/* Rapid fever rise alert - HIGHEST PRIORITY */}
        {rapid_rise && fever_rate && (
          <div className="bg-red-100 border-2 border-red-400 text-red-800 rounded-xl p-4 mb-6 text-sm font-semibold animate-pulse">
            🚨 ΤΑΧΕΙΑ ΑΝΟΔΟΣ ΠΥΡΕΤΟΥ! Ανέβηκε {(fever_rate * 30).toFixed(2)}°C σε 30 λεπτά.
          </div>
        )}

        {vErr && (
          <div className="bg-orange-50 border border-orange-200 text-orange-700 rounded-xl p-4 mb-6 text-sm">
            ⚠️ Καμία μέτρηση ακόμη. Η συσκευή δεν έχει στείλει δεδομένα ακόμη.
          </div>
        )}

        <div className="grid grid-cols-3 gap-4 mb-4">
          <VitalCard icon="🌡️" title="Θερμοκρασία"
            value={temp !== null ? `${temp.toFixed(1)}°C` : null}
            status={isHighFever ? 'critical' : isFever ? 'warn' : temp !== null ? 'ok' : 'unknown'}
            subLabel={isHighFever ? 'Υψηλός Πυρετός' : isFever ? 'Πυρετός' : 'Κανονική'}
          />
          <VitalCard icon="🧠" title="SpO₂"
            value={spo2 !== null ? `${Math.round(spo2)}%` : null}
            status={isSpo2Crit ? 'critical' : isSpo2Low ? 'warn' : spo2 !== null ? 'ok' : 'unknown'}
            subLabel={isSpo2Crit ? 'Κρίσιμο' : isSpo2Low ? 'Χαμηλό' : 'Κανονικό'}
          />
          <VitalCard icon="❤️" title="Καρδιακοί Παλμοί"
            value={bpm !== null ? `${bpm} bpm` : null}
            status={isHRAbnorm ? 'warn' : bpm !== null ? 'ok' : 'unknown'}
            subLabel={bpm !== null && bpm < 60 ? 'Βραδυκαρδία' : bpm !== null && bpm > 130 ? 'Ταχυκαρδία' : 'Κανονικοί'}
          />
        </div>

        <div className={`rounded-2xl border p-5 mb-6 ${BP_COLOR[bpLevel]}`}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-semibold">💓 Πίεση Αίματος</span>
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-white/60">{BP_LABEL[bpLevel]}</span>
          </div>
          <div className="text-5xl font-bold mt-2">
            {bpOk && sys && dia ? `${sys} / ${dia}` : '— / —'}
          </div>
          <div className="text-xs opacity-60 mt-1">mmHg (συστολική / διαστολική)</div>
        </div>

        {plan?.national_health_id && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6 text-sm">
            <span className="font-semibold text-blue-800">🏥 {plan.health_id_label}:</span>{' '}
            <span className="text-blue-700 font-mono">{plan.national_health_id}</span>
            <span className="text-blue-500 ml-2 text-xs">(για σύνδεση με νοσοκομείο)</span>
          </div>
        )}

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
          <h2 className="text-base font-semibold text-slate-700 mb-2">🔌 Συνδεδεμένες Συσκευές</h2>
          <div className="mb-4 space-y-2">
            {(devices ?? []).length === 0 && <p className="text-sm text-slate-400">Δεν υπάρχουν συσκευές.</p>}
            {(devices ?? []).map((d: any) => (
              <div key={d.device_id} className="text-sm border rounded p-2">
                <b>{d.device_id}</b> · mode: {d.connection_mode || '—'} · last seen: {d.last_seen_at ? new Date(d.last_seen_at).toLocaleString('el-GR') : '—'}
              </div>
            ))}
          </div>
          <h2 className="text-base font-semibold text-slate-700 mb-4">📋 Ιστορικό Πυρετών</h2>
          <FeverHistoryTable history={history ?? []} loading={!history && !vErr} />
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading...</div>}>
      <DashboardContent />
    </Suspense>
  );
}

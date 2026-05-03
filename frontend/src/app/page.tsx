'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createGuardian, createPatient } from '@/lib/api';

const HEALTH_ID_TYPES = [
  { value: '',      label: 'Χωρίς αριθμό υγείας' },
  { value: 'amka',  label: 'ΑΜΚΑ (Ελλάδα)' },
  { value: 'kvnr',  label: 'Krankenversicherungsnr. (Γερμανία)' },
  { value: 'svnr',  label: 'Sozialversicherungsnr. (Αυστρία)' },
  { value: 'snils', label: 'СНИЛС (Ρωσία)' },
  { value: 'nhs',   label: 'NHS Number (Ηνωμένο Βασίλειο)' },
  { value: 'nir',   label: 'NIR / INSEE (Γαλλία)' },
  { value: 'bsn',   label: 'BSN (Ολλανδία)' },
  { value: 'phn',   label: 'Provincial Health No. (Καναδάς)' },
  { value: 'ssn',   label: 'SSN (ΗΠΑ)' },
];

export default function Home() {
  const router = useRouter();
  const [hasConfig, setHasConfig] = useState(false);
  const [apiUrl,    setApiUrl]    = useState('');
  const [gName,     setGName]     = useState('');
  const [gEmail,    setGEmail]    = useState('');
  const [gPass,     setGPass]     = useState('');
  const [gPass2,    setGPass2]    = useState('');
  const [pName,     setPName]     = useState('');
  const [pDob,      setPDob]      = useState('');
  const [sub,       setSub]       = useState<'basic'|'bp'>('basic');
  const [healthIdType, setHealthIdType] = useState('');
  const [healthId,     setHealthId]     = useState('');
  const [country,      setCountry]      = useState('GR');
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');

  useEffect(() => {
    if (localStorage.getItem('medice_patient')) setHasConfig(true);
    const url = localStorage.getItem('medice_api_url');
    if (url) setApiUrl(url);
  }, []);

  const register = async () => {
    if (!apiUrl || !gName || !gEmail || !gPass || !pName) {
      setError('Συμπληρώστε όλα τα υποχρεωτικά πεδία.'); return;
    }
    if (gPass !== gPass2) {
      setError('Οι κωδικοί δεν ταιριάζουν.'); return;
    }
    if (gPass.length < 8) {
      setError('Ο κωδικός πρέπει να έχει τουλάχιστον 8 χαρακτήρες.'); return;
    }
    localStorage.setItem('medice_api_url', apiUrl.trim());
    setLoading(true); setError('');
    try {
      const { id: gId } = await createGuardian(gName, gEmail, gPass);
      const freeUntil = new Date();
      freeUntil.setMonth(freeUntil.getMonth() + 5);
      const { id: pId } = await createPatient({
        name: pName, birth_date: pDob || undefined,
        guardian_id: gId, subscription: sub,
        free_until: freeUntil.toISOString(),
        national_health_id:      healthId      || undefined,
        national_health_id_type: healthIdType  || undefined,
        country:                 country       || 'GR',
      });
      localStorage.setItem('medice_guardian', JSON.stringify({ id: gId, name: gName, email: gEmail }));
      localStorage.setItem('medice_patient',  JSON.stringify({ id: pId, name: pName, subscription: sub }));
      router.push('/dashboard');
    } catch (e: any) {
      setError(e.message || 'Σφάλμα εγγραφής.');
    } finally { setLoading(false); }
  };

  if (hasConfig) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-slate-800 mb-2">🏥 ThronomedICE</h1>
        <p className="text-slate-400 mb-8">Παρακολούθηση Ζωτικών Σημείων</p>
        <button onClick={() => router.push('/dashboard')}
          className="bg-slate-800 text-white px-8 py-3 rounded-xl text-lg font-semibold hover:bg-slate-700 transition">
          Άνοιγμα Dashboard
        </button>
        <div className="mt-4 space-y-2">
          <div>
            <Link href="/login" className="text-sm text-blue-600 hover:text-blue-800 underline">
              Σύνδεση με άλλο λογαριασμό
            </Link>
          </div>
          <div>
            <button onClick={() => { localStorage.clear(); setHasConfig(false); }}
              className="text-sm text-slate-400 hover:text-slate-600 underline">
              Επαναφορά / Νέος Χρήστης
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex items-center justify-center py-12 px-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-slate-800">🏥 ThronomedICE</h1>
          <p className="text-slate-400 mt-1">Δημιουργία Λογαριασμού</p>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-5">
          <Sec title="🌐 Διακομιστής">
            <Inp label="API URL *" value={apiUrl} set={setApiUrl}
              placeholder="https://thronos-medice.up.railway.app" type="url" />
          </Sec>

          <Sec title="👤 Κηδεμόνας">
            <Inp label="Όνομα *" value={gName} set={setGName} placeholder="Γιώργος Παπαδόπουλος" />
            <Inp label="Email *" value={gEmail} set={setGEmail} placeholder="email@example.com" type="email" />
            <Inp label="Κωδικός * (min 8 χαρ.)" value={gPass} set={setGPass} placeholder="••••••••" type="password" />
            <Inp label="Επιβεβαίωση Κωδικού *" value={gPass2} set={setGPass2} placeholder="••••••••" type="password" />
          </Sec>

          <Sec title="🧒 Ασθενής">
            <Inp label="Όνομα *" value={pName} set={setPName} placeholder="Μαρία Παπαδοπούλου" />
            <Inp label="Ημ. Γέννησης (YYYY-MM-DD)" value={pDob} set={setPDob} placeholder="2015-06-15" />
            <div>
              <label className="block text-xs text-slate-500 mb-2">Συνδρομή</label>
              <div className="grid grid-cols-2 gap-2">
                {(['basic','bp'] as const).map(s => (
                  <button key={s} onClick={() => setSub(s)}
                    className={`border rounded-lg py-2 text-sm font-medium transition ${
                      sub === s ? 'bg-slate-800 text-white border-slate-800'
                                : 'border-slate-200 text-slate-600 hover:border-slate-400'}`}>
                    {s === 'basic' ? 'Βασική — 10€/μήνα' : 'Με Πίεση — 15€/μήνα'}
                  </button>
                ))}
              </div>
              <p className="text-xs text-slate-400 mt-1">Δωρεάν 5 μήνες με την αγορά συσκευής</p>
            </div>
          </Sec>

          <Sec title="🏥 Αριθμός Υγείας (προαιρετικό)">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Τύπος Αριθμού</label>
              <select value={healthIdType} onChange={e => setHealthIdType(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300">
                {HEALTH_ID_TYPES.map(t => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            {healthIdType && (
              <Inp label="Αριθμός" value={healthId} set={setHealthId}
                placeholder={healthIdType === 'amka' ? '12345678901' : 'Αριθμός...'} />
            )}
            <p className="text-xs text-slate-400">
              Απαιτείται για αυτόματη σύνδεση με νοσοκομεία / κέντρα υγείας.
            </p>
          </Sec>

          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button onClick={register} disabled={loading}
            className="w-full bg-slate-800 text-white py-3 rounded-xl font-semibold hover:bg-slate-700 disabled:opacity-50 transition">
            {loading ? 'Εγγραφή...' : 'Εγγραφή'}
          </button>
          <p className="text-center text-sm text-slate-500">
            Έχετε ήδη λογαριασμό;{' '}
            <Link href="/login" className="text-blue-600 hover:text-blue-800 font-medium underline">
              Σύνδεση
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

function Sec({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-700 mb-3">{title}</h3>
      <div className="space-y-3">{children}</div>
    </div>
  );
}
function Inp({ label, value, set, placeholder, type = 'text' }: {
  label: string; value: string; set: (v: string) => void;
  placeholder?: string; type?: string;
}) {
  return (
    <div>
      <label className="block text-xs text-slate-500 mb-1">{label}</label>
      <input type={type} value={value} onChange={e => set(e.target.value)}
        placeholder={placeholder}
        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300" />
    </div>
  );
}

'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { login } from '@/lib/api';

export default function LoginPage() {
  const router  = useRouter();
  const [apiUrl,    setApiUrl]    = useState('');
  const [email,     setEmail]     = useState('');
  const [password,  setPassword]  = useState('');
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');
  // When guardian has multiple patients, let them pick one
  const [patients,  setPatients]  = useState<any[] | null>(null);
  const [guardian,  setGuardian]  = useState<any>(null);

  useEffect(() => {
    const url = localStorage.getItem('medice_api_url');
    if (url) setApiUrl(url);
  }, []);

  const doLogin = async () => {
    if (!apiUrl || !email || !password) {
      setError('Συμπληρώστε όλα τα πεδία.'); return;
    }
    localStorage.setItem('medice_api_url', apiUrl.trim());
    setLoading(true); setError('');
    try {
      const data = await login(email, password);
      setGuardian(data);
      localStorage.setItem('medice_guardian', JSON.stringify({
        id: data.guardian_id, name: data.name, email: data.email,
      }));
      if (data.patients.length === 0) {
        setError('Δεν βρέθηκαν ασθενείς σε αυτόν τον λογαριασμό.');
      } else if (data.patients.length === 1) {
        _selectPatient(data.patients[0]);
      } else {
        setPatients(data.patients);
      }
    } catch (e: any) {
      setError(e.message || 'Λανθασμένα στοιχεία.');
    } finally { setLoading(false); }
  };

  const _selectPatient = (p: any) => {
    localStorage.setItem('medice_patient', JSON.stringify({
      id: p.id, name: p.name, subscription: p.subscription,
      in_trial: p.in_trial, trial_days_left: p.trial_days_left,
    }));
    router.push('/dashboard');
  };

  // Patient picker (multiple patients under one guardian)
  if (patients) return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-slate-800">🏥 ThronomedICE</h1>
          <p className="text-slate-500 mt-1">Επιλογή Ασθενή</p>
          <p className="text-sm text-slate-400 mt-0.5">Καλώς ήρθατε, {guardian?.name}</p>
        </div>
        <div className="space-y-3">
          {patients.map(p => (
            <button key={p.id} onClick={() => _selectPatient(p)}
              className="w-full bg-white border border-slate-200 rounded-2xl p-4 text-left hover:border-slate-400 hover:shadow-sm transition">
              <div className="font-semibold text-slate-800">{p.name}</div>
              <div className="text-xs text-slate-500 mt-0.5 flex gap-3">
                <span>{p.subscription === 'bp' ? '💓 Με Πίεση' : '🌡️ Βασική'}</span>
                {p.in_trial && (
                  <span className="text-green-600">🎁 Trial — {p.trial_days_left} μέρες</span>
                )}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex items-center justify-center py-12 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-slate-800">🏥 ThronomedICE</h1>
          <p className="text-slate-400 mt-1">Σύνδεση</p>
        </div>
        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-4">
          <div>
            <label className="block text-xs text-slate-500 mb-1">API URL</label>
            <input type="url" value={apiUrl} onChange={e => setApiUrl(e.target.value)}
              placeholder="https://thronos-medice.up.railway.app"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300" />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Email</label>
            <input type="email" value={email} onChange={e => setEmail(e.target.value)}
              placeholder="email@example.com"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300" />
          </div>
          <div>
            <label className="block text-xs text-slate-500 mb-1">Κωδικός</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              onKeyDown={e => e.key === 'Enter' && doLogin()}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-300" />
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button onClick={doLogin} disabled={loading}
            className="w-full bg-slate-800 text-white py-3 rounded-xl font-semibold hover:bg-slate-700 disabled:opacity-50 transition">
            {loading ? 'Σύνδεση...' : 'Σύνδεση'}
          </button>
          <p className="text-center text-sm text-slate-500">
            Νέος χρήστης;{' '}
            <Link href="/" className="text-blue-600 hover:text-blue-800 font-medium underline">
              Εγγραφή
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

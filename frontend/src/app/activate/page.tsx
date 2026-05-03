'use client';
import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

export default function ActivatePage() {
  const router = useRouter();
  const params = useSearchParams();
  const [code,      setCode]      = useState(params?.get('code') ?? '');
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');
  const [success,   setSuccess]   = useState<any>(null);
  const [checking,  setChecking]  = useState(false);
  const [preview,   setPreview]   = useState<any>(null);

  const apiBase = () =>
    (typeof window !== 'undefined' && localStorage.getItem('medice_api_url')) ||
    process.env.NEXT_PUBLIC_API_URL || '';

  // Live preview of code validity while user types
  useEffect(() => {
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length < 15) { setPreview(null); return; }
    const t = setTimeout(async () => {
      setChecking(true);
      try {
        const res = await fetch(`${apiBase()}/reseller/code/${encodeURIComponent(trimmed)}`);
        if (res.ok) setPreview(await res.json());
        else setPreview(null);
      } catch { setPreview(null); }
      finally { setChecking(false); }
    }, 600);
    return () => clearTimeout(t);
  }, [code]);

  const handleActivate = async () => {
    const g = localStorage.getItem('medice_guardian');
    if (!g) { router.replace('/login'); return; }
    const guardian = JSON.parse(g);

    if (!code.trim()) { setError('Εισάγετε τον κωδικό ενεργοποίησης.'); return; }
    setLoading(true); setError('');
    try {
      const res = await fetch(`${apiBase()}/reseller/activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code.trim().toUpperCase(), guardian_id: guardian.id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Σφάλμα ενεργοποίησης.');
      setSuccess(data);
      // Update stored guardian tier
      localStorage.setItem('medice_guardian', JSON.stringify({ ...guardian, tier: data.tier }));
    } catch (e: any) {
      setError(e.message);
    } finally { setLoading(false); }
  };

  const tierLabel: Record<string, string> = {
    basic: '📱 Βασικό (€10/μήνα)', premium: '⭐ Premium (€15/μήνα)', family: '👨‍👩‍👧‍👦 Οικογένεια (€25/μήνα)',
  };

  if (success) return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-green-200 p-8 text-center">
        <div className="text-6xl mb-4">✅</div>
        <h1 className="text-2xl font-bold text-green-700 mb-2">Ενεργοποίηση Επιτυχής!</h1>
        <p className="text-slate-600 mb-4">{success.message}</p>
        <div className="bg-green-50 rounded-xl p-4 mb-6 text-sm text-green-800 space-y-1">
          <div>📦 Αγοράστηκε από: <strong>{success.reseller_name}</strong></div>
          <div>🗓️ Δωρεάν έως: <strong>{new Date(success.trial_ends_at).toLocaleDateString('el-GR')}</strong></div>
          <div>📋 Πλάνο: <strong>{tierLabel[success.tier] ?? success.tier}</strong></div>
        </div>
        <button onClick={() => router.push('/dashboard')}
          className="w-full bg-slate-800 text-white py-3 rounded-xl font-semibold hover:bg-slate-700 transition">
          Άνοιγμα Dashboard →
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">📦</div>
          <h1 className="text-2xl font-bold text-slate-800">Ενεργοποίηση Συσκευής</h1>
          <p className="text-slate-400 mt-1 text-sm">Εισάγετε τον κωδικό από το κουτί της συσκευής σας</p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-5">
          <div>
            <label className="block text-xs text-slate-500 mb-1">Κωδικός Ενεργοποίησης</label>
            <input
              value={code}
              onChange={e => setCode(e.target.value.toUpperCase())}
              placeholder="THR-XXXX-YYYY-ZZZZ"
              className="w-full border border-slate-200 rounded-lg px-3 py-3 text-sm font-mono text-center tracking-widest focus:outline-none focus:ring-2 focus:ring-slate-300 uppercase"
            />
            <p className="text-xs text-slate-400 mt-1">Βρείτε τον κωδικό στην κάρτα μέσα στο κουτί ή στο QR sticker στη συσκευή.</p>
          </div>

          {checking && (
            <div className="text-xs text-slate-400 text-center animate-pulse">Έλεγχος κωδικού...</div>
          )}

          {preview && !checking && (
            <div className={`rounded-xl border p-3 text-sm ${
              preview.is_valid ? 'bg-green-50 border-green-200 text-green-800' : 'bg-red-50 border-red-200 text-red-700'
            }`}>
              {preview.is_valid ? (
                <>
                  <div>✅ Έγκυρος κωδικός — <strong>{preview.reseller}</strong></div>
                  <div className="mt-1 text-xs">
                    🎁 {preview.free_months} μήνες δωρεάν · Πλάνο: {tierLabel[preview.device_tier] ?? preview.device_tier}
                  </div>
                </>
              ) : (
                <div>❌ {preview.is_used ? 'Ο κωδικός έχει ήδη χρησιμοποιηθεί.' : 'Μη έγκυρος κωδικός.'}</div>
              )}
            </div>
          )}

          {error && <p className="text-red-500 text-sm">{error}</p>}

          <button
            onClick={handleActivate}
            disabled={loading || (preview !== null && !preview.is_valid)}
            className="w-full bg-slate-800 text-white py-3 rounded-xl font-semibold hover:bg-slate-700 disabled:opacity-50 transition"
          >
            {loading ? 'Ενεργοποίηση...' : '🚀 Ενεργοποίηση'}
          </button>

          <div className="text-center text-xs text-slate-400">
            Δεν έχετε λογαριασμό ακόμη;{' '}
            <button onClick={() => router.push('/')} className="text-slate-600 underline">Εγγραφή πρώτα</button>
          </div>
        </div>

        <div className="mt-6 text-center text-xs text-slate-400 space-y-1">
          <div>🔒 Κάθε κωδικός λειτουργεί μόνο μία φορά.</div>
          <div>Πρόβλημα με τον κωδικό; Επικοινωνήστε με <strong>το φαρμακείο σας</strong> ή support@thronoschain.org</div>
        </div>
      </div>
    </div>
  );
}

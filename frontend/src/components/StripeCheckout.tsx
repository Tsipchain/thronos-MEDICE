'use client';
import { useState } from 'react';
import { createCheckoutSession } from '@/lib/api';

interface StripeCheckoutProps {
  guardianId: number;
  onSuccess?: () => void;
}

export default function StripeCheckout({ guardianId, onSuccess }: StripeCheckoutProps) {
  const [tier, setTier] = useState<'basic' | 'premium' | 'family'>('basic');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const tiers = [
    { value: 'basic' as const,   label: 'Βασική',    price: '€10', desc: 'Θερμ. + SpO₂ + HR' },
    { value: 'premium' as const, label: 'Premium',   price: '€15', desc: '+ Πίεση + Ύπνος' },
    { value: 'family' as const,  label: 'Family',    price: '€25', desc: 'Έως 4 παιδιά' },
  ];

  const handleCheckout = async () => {
    setLoading(true);
    setError('');
    try {
      const current = window.location.href;
      const success = current.includes('?') ? current + '&success=1' : current + '?success=1';
      const cancel = current;
      
      const { checkout_url } = await createCheckoutSession(guardianId, tier, success, cancel);
      window.location.href = checkout_url;
    } catch (e: any) {
      setError(e.message || 'Σφάλμα δημιουργίας συνδρομής.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="bg-white rounded-2xl border border-slate-200 p-6">
        <h2 className="text-xl font-bold text-slate-800 mb-6">💳 Επιλέξτε Σχέδιο</h2>
        
        <div className="grid grid-cols-3 gap-4 mb-6">
          {tiers.map(t => (
            <button key={t.value} onClick={() => setTier(t.value)}
              className={`border-2 rounded-xl p-4 transition text-center ${
                tier === t.value
                  ? 'border-slate-800 bg-slate-50'
                  : 'border-slate-200 hover:border-slate-400'
              }`}>
              <div className="font-semibold text-slate-800">{t.label}</div>
              <div className="text-2xl font-bold text-slate-700 mt-2">{t.price}</div>
              <div className="text-xs text-slate-500 mt-1">/μήνα</div>
              <div className="text-xs text-slate-400 mt-2">{t.desc}</div>
            </button>
          ))}
        </div>

        {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

        <button onClick={handleCheckout} disabled={loading}
          className="w-full bg-slate-800 text-white py-3 rounded-xl font-semibold hover:bg-slate-700 disabled:opacity-50 transition">
          {loading ? 'Επεξεργασία...' : '✓ Συνέχεια με Stripe'}
        </button>
      </div>
    </div>
  );
}

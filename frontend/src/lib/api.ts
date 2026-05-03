function base(): string {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('medice_api_url') ||
      process.env.NEXT_PUBLIC_API_URL || '';
  }
  return process.env.NEXT_PUBLIC_API_URL || '';
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(base() + path, { ...init, cache: 'no-store' });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const j = await res.json(); msg = j.detail || msg; } catch {}
    throw new Error(msg);
  }
  return res.json();
}

export const getVitals       = (id: number) => req<any>(`/patients/${id}/vitals`);
export const getFeverHistory = (id: number) => req<any[]>(`/patients/${id}/fever-history`);
export const getPatientPlan  = (id: number) => req<any>(`/patients/${id}/plan`);
export const getSubscription = (id: number) => req<any>(`/guardian/${id}/subscription`);

export const createGuardian = (name: string, email: string, password: string) =>
  req<{ id: number }>('/guardians', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email, password }),
  });

export const login = (email: string, password: string) =>
  req<{ guardian_id: number; name: string; email: string; patients: any[] }>('/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

export const createPatient = (data: {
  name: string; birth_date?: string;
  guardian_id: number; subscription: string; free_until?: string;
  national_health_id?: string; national_health_id_type?: string; country?: string;
}) =>
  req<{ id: number }>('/patients', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

export const createCheckoutSession = (guardian_id: number, tier: string, success_url: string, cancel_url: string) =>
  req<{ checkout_url: string }>('/subscribe/checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ guardian_id, tier, success_url, cancel_url }),
  });

export const simulate = (data: {
  temperature: number; spo2?: number; bpm?: number;
  systolic?: number; diastolic?: number;
}) =>
  req<any>('/simulate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });

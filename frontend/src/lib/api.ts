function base(): string {
  const fallback = 'https://thronos-medice.up.railway.app';
  if (typeof window !== 'undefined') {
    const localUrl = localStorage.getItem('medice_api_url') || '';
    return normalizeBaseUrl(localUrl) ||
      normalizeBaseUrl(process.env.NEXT_PUBLIC_API_URL || '') ||
      normalizeBaseUrl(fallback);
  }
  return normalizeBaseUrl(process.env.NEXT_PUBLIC_API_URL || '') || normalizeBaseUrl(fallback);
}

function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, '');
}

function normalizePath(path: string): string {
  return '/' + path.replace(/^\/+/, '');
}

function apiUrl(path: string): string {
  return normalizeBaseUrl(base()) + normalizePath(path);
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const payload = init?.body ? JSON.parse(String(init.body)) : undefined;
  const safePayload = payload && typeof payload === 'object' ? { ...payload, password: payload.password ? '***' : undefined } : payload;
  const res = await fetch(apiUrl(path), {
    ...init,
    cache: 'no-store',
    headers: {
      Accept: 'application/json',
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    let bodyText = '';
    try {
      bodyText = await res.text();
      const j = JSON.parse(bodyText);
      msg = j.detail || j.message || msg;
    } catch {}
    if (process.env.NODE_ENV !== 'production') {
      console.error('API request failed', { status: res.status, body: bodyText, payload: safePayload, path });
    }
    throw new Error(msg);
  }
  return res.json();
}

export const getVitals       = (id: number) => req<any>(`/patients/${id}/vitals`);
export const getFeverHistory = (id: number) => req<any[]>(`/patients/${id}/fever-history`);
export const getPatientPlan  = (id: number) => req<any>(`/patients/${id}/plan`);
export const getPatientDevices = (id: number) => req<any[]>(`/patients/${id}/devices`);
export const getSubscription = (id: number) => req<any>(`/guardian/${id}/subscription`);

export const createGuardian = (name: string, email: string, password: string) =>
  req<{ id: number }>('/guardians', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email, password }),
  });

export const registerGuardianAndPatient = (payload: {
  guardian: { name: string; email: string; password: string };
  patient: {
    name: string;
    birth_date: string;
    subscription: 'basic'|'bp'|'premium';
    national_health_id?: string;
    national_health_id_type?: string;
    country?: string;
  }
}) => req<{ guardian_id: number; patient_id: number; status: string }>('/register', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(payload),
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

export const postReading = (data: {
  patient_id: string;
  device_id: string;
  temperature: number;
  spo2?: number;
  bpm?: number;
  systolic?: number;
  diastolic?: number;
  spo2_valid?: boolean;
  bpm_valid?: boolean;
  bp_valid?: boolean;
}) => req<any>('/readings', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(data),
});

export const registerDevice = (data: {
  patient_id: number;
  device_id: string;
  device_type?: string;
  firmware_version?: string;
  connection_mode?: string;
}) => req<{ status: string; id: number; device_id: string }>('/devices/register', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(data),
});

function base(): string {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('medice_api_url') ||
      process.env.NEXT_PUBLIC_API_URL || '';
  }
  return process.env.NEXT_PUBLIC_API_URL || '';
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(base() + path, { ...init, cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export const getVitals       = (id: number) => req<any>(`/patients/${id}/vitals`);
export const getFeverHistory = (id: number) => req<any[]>(`/patients/${id}/fever-history`);

export const createGuardian = (name: string, email: string) =>
  req<{ id: number }>('/guardians', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email }),
  });

export const createPatient = (data: {
  name: string; birth_date?: string;
  guardian_id: number; subscription: string; free_until?: string;
}) =>
  req<{ id: number }>('/patients', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
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

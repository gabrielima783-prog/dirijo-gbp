import type { Analysis, AnalysisInput, Finding, PublicSettings, SettingsProvider, SettingsUpdate, SlideSpec, SourceKey } from './types';

const base = '/api';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: string; message?: string } | null;
    throw new Error(payload?.message || payload?.error || `A solicitação falhou (${response.status}).`);
  }
  return response.json() as Promise<T>;
}

export const api = {
  settings: () => request<PublicSettings>('/settings'),
  updateSettings: (input: SettingsUpdate) => request<PublicSettings>('/settings', { method: 'PUT', body: JSON.stringify(input) }),
  testSetting: (provider: SettingsProvider) => request<{ ok: boolean; message: string }>(`/settings/test/${provider}`, { method: 'POST' }),
  list: () => request<Analysis[]>('/analyses'),
  get: (id: string) => request<Analysis>(`/analyses/${id}`),
  estimate: (id: string) => request<{ estimatedCostUsd: number }>(`/analyses/${id}/cost-estimate`),
  create: (input: AnalysisInput) => request<Analysis>('/analyses', { method: 'POST', body: JSON.stringify(input) }),
  collect: (id: string, confirmOverBudget = false) => request<Analysis>(`/analyses/${id}/collect`, { method: 'POST', body: JSON.stringify({ confirmOverBudget }) }),
  retry: (id: string, source: SourceKey) => request<Analysis>(`/analyses/${id}/retry/${source}`, { method: 'POST' }),
  updateFindings: (id: string, findings: Finding[]) => request<Analysis>(`/analyses/${id}/findings`, { method: 'PUT', body: JSON.stringify({ findings }) }),
  updateSlides: (id: string, slides: SlideSpec[]) => request<Analysis>(`/analyses/${id}/slides`, { method: 'PUT', body: JSON.stringify({ slides }) }),
  finalize: (id: string) => request<Analysis>(`/analyses/${id}/finalize`, { method: 'POST' }),
  duplicate: (id: string) => request<Analysis>(`/analyses/${id}/duplicate`, { method: 'POST' }),
  regenerateSlide: (id: string, slideId: string) => request<Analysis>(`/analyses/${id}/slides/${slideId}/regenerate`, { method: 'POST' }),
};

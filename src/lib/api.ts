import { useSession } from "@/lib/auth";
import type { components } from "@/lib/api-schema";

export type Membership = components["schemas"]["MeResponse"]["organizations"][number];
export type MeResponse = components["schemas"]["MeResponse"];
export type SalesSummary = components["schemas"]["SalesSummary"];
export type Transaction = components["schemas"]["Transaction"];
export type AssistantResponse = components["schemas"]["AssistantResponse"];

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = useSession.getState().accessToken;
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init.headers },
    cache: "no-store",
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const error = new Error(body.detail || `Request failed (${response.status})`);
    Object.assign(error, { status: response.status });
    throw error;
  }
  return response.json() as Promise<T>;
}

export const api = {
  me: () => apiFetch<MeResponse>("/api/v1/me"),
  sales: (org: string, from: string, to: string) => apiFetch<SalesSummary>(`/api/v1/organizations/${org}/analytics/sales?from_at=${encodeURIComponent(from)}&to_at=${encodeURIComponent(to)}`),
  transactions: (org: string) => apiFetch<Transaction[]>(`/api/v1/organizations/${org}/transactions?limit=8`),
  ask: (org: string, question: string) => apiFetch<AssistantResponse>(`/api/v1/organizations/${org}/assistant`, { method: "POST", body: JSON.stringify({ question }) }),
};

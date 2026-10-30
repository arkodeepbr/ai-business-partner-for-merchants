import { useSession } from "@/lib/auth";
import type { Locale } from "@/lib/locale";
import type { components } from "@/lib/api-schema";

export type Membership = components["schemas"]["MeResponse"]["organizations"][number];
export type MeResponse = components["schemas"]["MeResponse"];
export type SalesSummary = components["schemas"]["SalesSummary"];
export type Transaction = components["schemas"]["Transaction"];
export type AssistantResponse = components["schemas"]["AssistantResponse"];
export type WorkspaceData = components["schemas"]["WorkspaceData"];
export type WorkspaceDataUpdate = components["schemas"]["WorkspaceDataUpdate"];
export type FinanceRecord = components["schemas"]["FinanceRecord"];
export type FinanceRecordKind = FinanceRecord["kind"];

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
  chat: (messages: { role: "user" | "assistant"; content: string }[], locale: Locale) => apiFetch<AssistantResponse>("/api/v1/assistant/chat", { method: "POST", body: JSON.stringify({ messages, locale }) }),
  workspace: () => apiFetch<WorkspaceData>("/api/v1/me/workspace"),
  saveWorkspace: (data: WorkspaceDataUpdate) => apiFetch<WorkspaceData>("/api/v1/me/workspace", { method: "PATCH", body: JSON.stringify(data) }),
  finance: () => apiFetch<components["schemas"]["FinanceRecords"]>("/api/v1/me/finance"),
  saveFinance: (records: FinanceRecord[]) => apiFetch<components["schemas"]["FinanceRecords"]>("/api/v1/me/finance", { method: "PUT", body: JSON.stringify({ records }) }),
};

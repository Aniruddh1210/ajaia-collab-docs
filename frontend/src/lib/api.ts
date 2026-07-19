import { supabase } from "./supabase";
import type {
  DocumentDetail,
  DocumentSummary,
  ImportResult,
  Role,
  Share,
} from "./types";

const BASE = (import.meta.env.VITE_API_URL as string) ?? "http://localhost:8000";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function authHeader(): Promise<Record<string, string>> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    ...(init.body && !(init.body instanceof FormData)
      ? { "Content-Type": "application/json" }
      : {}),
    ...(await authHeader()),
    ...((init.headers as Record<string, string>) ?? {}),
  };

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, { ...init, headers });
  } catch {
    throw new ApiError(0, "Network error — is the backend running?");
  }

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const detail =
      (data && (data.detail?.msg || data.detail)) || `Request failed (${res.status})`;
    throw new ApiError(res.status, typeof detail === "string" ? detail : "Request failed");
  }
  return data as T;
}

export const api = {
  listDocuments: () => request<DocumentSummary[]>("/api/documents"),

  getDocument: (id: string) => request<DocumentDetail>(`/api/documents/${id}`),

  createDocument: (payload: { title?: string; content?: Record<string, unknown> }) =>
    request<DocumentSummary>("/api/documents", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  updateDocument: (
    id: string,
    payload: { title?: string; content?: Record<string, unknown> }
  ) =>
    request<DocumentDetail>(`/api/documents/${id}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    }),

  deleteDocument: (id: string) =>
    request<void>(`/api/documents/${id}`, { method: "DELETE" }),

  listShares: (id: string) => request<Share[]>(`/api/documents/${id}/shares`),

  addShare: (id: string, email: string, role: Role) =>
    request<Share>(`/api/documents/${id}/shares`, {
      method: "POST",
      body: JSON.stringify({ email, role }),
    }),

  removeShare: (id: string, shareId: string) =>
    request<void>(`/api/documents/${id}/shares/${shareId}`, { method: "DELETE" }),

  importFile: (file: File) => {
    const form = new FormData();
    form.append("file", file);
    return request<ImportResult>("/api/import", { method: "POST", body: form });
  },
};

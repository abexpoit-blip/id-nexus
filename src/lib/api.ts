// Environment-aware API base URL.
// - Local dev (`bun dev`)              → "" (Vite proxy /api → api.nexus-x.cloud)
// - Lovable preview / sandbox          → "" (Vite proxy too — avoids CORS)
// - Production build on buy.nexus-x... → "https://api.nexus-x.cloud"
// - Override anywhere with VITE_API_BASE_URL or VITE_API_BASE
function resolveApiBase(): string {
  const env = (import.meta as any).env || {};
  const override = (env.VITE_API_BASE_URL || env.VITE_API_BASE)?.replace(/\/$/, "");
  if (override) return override;
  if (env.DEV) return "";
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    // Lovable preview / sandbox / lovable.app domains must use the proxy
    if (
      host.endsWith(".lovableproject.com") ||
      host.endsWith(".lovable.app") ||
      host.endsWith(".lovable.dev") ||
      host === "localhost" ||
      host === "127.0.0.1"
    ) {
      return "";
    }
  }
  return "https://api.nexus-x.cloud";
}
const API_BASE = resolveApiBase();

export class ApiError extends Error {
  status: number;
  data: any;
  constructor(status: number, message: string, data?: any) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

type Options = RequestInit & { json?: any; query?: Record<string, any> };

async function request<T = any>(path: string, opts: Options = {}, isRetry = false): Promise<T> {
  const { json, query, headers, ...rest } = opts;
  let url = API_BASE + (path.startsWith("/") ? path : "/" + path);
  if (query && Object.keys(query).length) {
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== "") qs.append(k, String(v));
    }
    const qss = qs.toString();
    if (qss) url += (url.includes("?") ? "&" : "?") + qss;
  }
  const init: RequestInit = {
    credentials: "include",
    ...rest,
    headers: {
      ...(json !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(headers || {}),
    },
    body: json !== undefined ? JSON.stringify(json) : (rest as any).body,
  };
  const res = await fetch(url, init);

  // Auto-refresh once on 401
  if (res.status === 401 && !isRetry && !path.startsWith("/api/auth/")) {
    const ref = await fetch(API_BASE + "/api/auth/refresh", {
      method: "POST",
      credentials: "include",
    });
    if (ref.ok) return request<T>(path, opts, true);
  }

  let data: any = null;
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) data = await res.json().catch(() => null);
  else data = await res.text().catch(() => null);

  if (!res.ok) {
    const msg = (data && (data.error || data.message)) || res.statusText || "Request failed";
    throw new ApiError(res.status, msg, data);
  }
  return data as T;
}

export const api = {
  base: API_BASE,
  get: <T = any>(p: string, query?: Record<string, any>) => request<T>(p, { method: "GET", query }),
  post: <T = any>(p: string, json?: any) => request<T>(p, { method: "POST", json }),
  put: <T = any>(p: string, json?: any) => request<T>(p, { method: "PUT", json }),
  patch: <T = any>(p: string, json?: any) => request<T>(p, { method: "PATCH", json }),
  del: <T = any>(p: string) => request<T>(p, { method: "DELETE" }),
  upload: <T = any>(p: string, formData: FormData) =>
    request<T>(p, { method: "POST", body: formData as any }),
  raw: request,
  download: async (path: string, filename: string, query?: Record<string, any>) => {
    let url = API_BASE + (path.startsWith("/") ? path : "/" + path);
    if (query) {
      const qs = new URLSearchParams();
      for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== "") qs.append(k, String(v));
      const s = qs.toString();
      if (s) url += (url.includes("?") ? "&" : "?") + s;
    }
    const res = await fetch(url, { credentials: "include" });
    if (!res.ok) throw new ApiError(res.status, "Download failed");
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  },
};

export type ApiUser = { id: string; email: string };
export type ApiProfile = {
  id: string;
  email: string;
  display_name: string | null;
  balance_bdt: number | string;
  is_banned: boolean;
  contact_handle?: string | null;
  buyer_settings?: any;
};
export type AppRole = "admin" | "seller" | "buyer";

export const authApi = {
  me: () => api.get<{ user: ApiUser; profile: ApiProfile; roles: AppRole[] }>("/api/auth/me"),
  login: (email: string, password: string) =>
    api.post<{ ok: true; user: ApiUser }>("/api/auth/login", { email, password }),
  register: (email: string, password: string, display_name?: string) =>
    api.post<{ ok: true; user: ApiUser }>("/api/auth/register", { email, password, display_name }),
  logout: () => api.post("/api/auth/logout"),
};
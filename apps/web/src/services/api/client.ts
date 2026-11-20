import type { ApiResponse, AuthSession } from "@smartdine/shared";

import { useAuthStore } from "@/stores/authStore";

const API_BASE = "/api/v2";

export class ApiClientError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiClientError";
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
  /** Resolve with `{ data, meta }` instead of just `data` (paginated lists). */
  envelope?: boolean;
  /** Skip attaching the token and the refresh-and-retry behaviour (auth endpoints). */
  anonymous?: boolean;
}

async function send<TData>(path: string, options: RequestOptions): Promise<TData> {
  const token = useAuthStore.getState().accessToken;
  const headers: Record<string, string> = {};
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (token && !options.anonymous) headers.Authorization = `Bearer ${token}`;

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: options.method ?? "GET",
      credentials: "include",
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
    });
  } catch {
    throw new ApiClientError(0, "NETWORK_ERROR", "Unable to reach the server.");
  }

  let payload: ApiResponse<TData>;
  try {
    payload = (await response.json()) as ApiResponse<TData>;
  } catch {
    throw new ApiClientError(
      response.status,
      "INVALID_RESPONSE",
      "Received an unreadable response.",
    );
  }

  if (!payload.success) {
    throw new ApiClientError(
      response.status,
      payload.error.code,
      payload.error.message,
      payload.error.details,
    );
  }
  return (options.envelope ? { data: payload.data, meta: payload.meta } : payload.data) as TData;
}

let refreshInFlight: Promise<AuthSession> | null = null;

/** Exchanges the refresh cookie for a new session. Concurrent callers share one request. */
export function refreshSession(): Promise<AuthSession> {
  refreshInFlight ??= send<AuthSession>("/auth/refresh", { method: "POST", anonymous: true })
    .then((session) => {
      useAuthStore.getState().setSession(session);
      return session;
    })
    .finally(() => {
      refreshInFlight = null;
    });
  return refreshInFlight;
}

/** Typed fetch wrapper: unwraps the API envelope and transparently renews an expired access token once. */
export async function apiRequest<TData>(
  path: string,
  options: RequestOptions = {},
): Promise<TData> {
  try {
    return await send<TData>(path, options);
  } catch (error) {
    const expired = error instanceof ApiClientError && error.status === 401 && !options.anonymous;
    if (!expired || !useAuthStore.getState().accessToken) throw error;

    try {
      await refreshSession();
    } catch {
      useAuthStore.getState().clear();
      throw error;
    }
    return send<TData>(path, options);
  }
}

/** Fetches a binary file (a PDF receipt) with the same auth and one-time token renewal as `apiRequest`. */
export async function apiDownload(path: string): Promise<Blob> {
  const attempt = () => {
    const token = useAuthStore.getState().accessToken;
    return fetch(`${API_BASE}${path}`, {
      credentials: "include",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }).catch(() => {
      throw new ApiClientError(0, "NETWORK_ERROR", "Unable to reach the server.");
    });
  };
  let response = await attempt();
  if (response.status === 401 && useAuthStore.getState().accessToken) {
    try {
      await refreshSession();
    } catch {
      useAuthStore.getState().clear();
      throw new ApiClientError(401, "UNAUTHENTICATED", "Please sign in again.");
    }
    response = await attempt();
  }
  if (!response.ok) {
    throw new ApiClientError(response.status, "DOWNLOAD_FAILED", "Couldn't download the file.");
  }
  return response.blob();
}

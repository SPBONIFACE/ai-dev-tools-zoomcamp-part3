import type { BoardEl, BoardOp } from "./board-types";

const getApiUrl = (): string => {
  if (import.meta.env.VITE_API_URL) return import.meta.env.VITE_API_URL;
  if (typeof window !== "undefined" && window.location.port !== "8080" && window.location.port !== "5173") {
    return window.location.origin;
  }
  return "http://localhost:8091";
};

const getWsUrl = (): string => {
  if (import.meta.env.VITE_WS_URL) return import.meta.env.VITE_WS_URL;
  if (typeof window !== "undefined" && window.location.port !== "8080" && window.location.port !== "5173") {
    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    return `${proto}//${window.location.host}`;
  }
  return "ws://localhost:8091";
};

const API_URL = getApiUrl();
const WS_URL = getWsUrl();

export interface UserProfile {
  id: string;
  email: string;
  created_at: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: UserProfile;
}

export interface SessionRow {
  id: string;
  owner_id: string;
  title: string;
  candidate_name: string;
  role_title: string;
  status: "draft" | "live" | "completed";
  join_token: string;
  notes: string;
  link_revoked: boolean;
  created_at: string;
  updated_at: string;
  ended_at: string | null;
}

export interface BoardSessionSummary {
  id: string;
  title: string;
  role_title: string;
  candidate_name: string;
  status: string;
  link_revoked: boolean;
}

export interface BoardJoinResponse {
  found: boolean;
  revoked: boolean;
  session?: BoardSessionSummary;
  elements: BoardEl[];
}

class ApiClient {
  private tokenKey = "loopback_access_token";

  getToken(): string | null {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(this.tokenKey);
  }

  setToken(token: string): void {
    if (typeof window === "undefined") return;
    localStorage.setItem(this.tokenKey, token);
  }

  clearToken(): void {
    if (typeof window === "undefined") return;
    localStorage.removeItem(this.tokenKey);
  }

  isAuthenticated(): boolean {
    return !!this.getToken();
  }

  private async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const url = `${API_URL}${path}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(options.headers as Record<string, string>),
    };

    const token = this.getToken();
    if (token && !headers["Authorization"]) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const response = await fetch(url, {
      ...options,
      headers,
    });

    if (!response.ok) {
      let errorMsg = `HTTP Error ${response.status}`;
      try {
        const errorData = await response.json();
        if (errorData.detail) errorMsg = errorData.detail;
      } catch {
        // use default error message
      }
      throw new Error(errorMsg);
    }

    return response.json() as Promise<T>;
  }

  // --- Authentication ---
  readonly auth = {
    signup: async (credentials: { email: string; password: string }): Promise<AuthResponse> => {
      const data = await this.request<AuthResponse>("/api/auth/signup", {
        method: "POST",
        body: JSON.stringify(credentials),
      });
      if (data.access_token) {
        this.setToken(data.access_token);
      }
      return data;
    },

    login: async (credentials: { email: string; password: string }): Promise<AuthResponse> => {
      const data = await this.request<AuthResponse>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify(credentials),
      });
      if (data.access_token) {
        this.setToken(data.access_token);
      }
      return data;
    },

    me: async (): Promise<UserProfile> => {
      return this.request<UserProfile>("/api/auth/me");
    },

    logout: async (): Promise<void> => {
      try {
        await this.request<{ ok: boolean }>("/api/auth/logout", { method: "POST" });
      } catch {
        // ignore logout errors
      } finally {
        this.clearToken();
      }
    },

    getToken: () => this.getToken(),
    setToken: (t: string) => this.setToken(t),
    clearToken: () => this.clearToken(),
    isAuthenticated: () => this.isAuthenticated(),
  };

  // --- Sessions (Interviewer Dashboard) ---
  readonly sessions = {
    list: async (): Promise<SessionRow[]> => {
      return this.request<SessionRow[]>("/api/sessions");
    },

    create: async (data: {
      title: string;
      candidate_name?: string;
      role_title?: string;
    }): Promise<SessionRow> => {
      return this.request<SessionRow>("/api/sessions", {
        method: "POST",
        body: JSON.stringify(data),
      });
    },

    get: async (id: string): Promise<SessionRow> => {
      return this.request<SessionRow>(`/api/sessions/${id}`);
    },

    update: async (
      id: string,
      patch: Partial<{
        title: string;
        candidate_name: string;
        role_title: string;
        notes: string;
        status: "draft" | "live" | "completed";
        link_revoked: boolean;
      }>,
    ): Promise<SessionRow> => {
      return this.request<SessionRow>(`/api/sessions/${id}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      });
    },

    delete: async (id: string): Promise<{ ok: boolean }> => {
      return this.request<{ ok: boolean }>(`/api/sessions/${id}`, {
        method: "DELETE",
      });
    },
  };

  // --- Board & Canvas Sync ---
  readonly boards = {
    join: async (token: string): Promise<BoardJoinResponse> => {
      return this.request<BoardJoinResponse>(`/api/boards/${token}`);
    },

    pushOps: async (token: string, ops: BoardOp[]): Promise<{ ok: boolean }> => {
      return this.request<{ ok: boolean }>(`/api/boards/${token}/ops`, {
        method: "POST",
        body: JSON.stringify({ ops }),
      });
    },

    getOwned: async (token: string): Promise<{ owned: boolean; session: SessionRow | null }> => {
      return this.request<{ owned: boolean; session: SessionRow | null }>(
        `/api/boards/${token}/owned`,
      );
    },

    createWebSocket: (token: string, name?: string, role?: string): WebSocket => {
      const params = new URLSearchParams();
      if (name) params.set("name", name);
      if (role) params.set("role", role);
      const queryString = params.toString() ? `?${params.toString()}` : "";
      return new WebSocket(`${WS_URL}/ws/board/${token}${queryString}`);
    },
  };
}

export const api = new ApiClient();

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { apiFetch, clearToken, readToken, saveToken, User } from "./api";

type AuthCtx = {
  user: User | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  setUser: (u: User | null) => void;
};

const Ctx = createContext<AuthCtx>(null as any);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    const token = await readToken();
    if (!token) { setUser(null); return; }
    try {
      const me = await apiFetch("/auth/me");
      setUser(me);
    } catch {
      await clearToken();
      setUser(null);
    }
  }, []);

  useEffect(() => {
    (async () => { await refresh(); setReady(true); })();
  }, [refresh]);

  const login = async (email: string, password: string) => {
    const r = await apiFetch("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
    await saveToken(r.access_token);
    setUser(r.user);
  };
  const register = async (email: string, password: string, name: string) => {
    const r = await apiFetch("/auth/register", { method: "POST", body: JSON.stringify({ email, password, name }) });
    await saveToken(r.access_token);
    setUser(r.user);
  };
  const logout = async () => { await clearToken(); setUser(null); };

  return <Ctx.Provider value={{ user, ready, login, register, logout, refresh, setUser }}>{children}</Ctx.Provider>;
}

export function useAuth() { return useContext(Ctx); }

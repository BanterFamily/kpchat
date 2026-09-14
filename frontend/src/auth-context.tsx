import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { apiFetch, clearToken, readToken, saveToken, User } from "./api";

type OtpRequestResp = { phone: string; expires_in: number; dev_code?: string | null };

type AuthCtx = {
  user: User | null;
  ready: boolean;
  requestOtp: (phone: string, purpose: "register" | "login", name?: string) => Promise<OtpRequestResp>;
  verifyOtp: (phone: string, code: string, name?: string) => Promise<User>;
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

  const requestOtp = async (phone: string, purpose: "register" | "login", name?: string) => {
    return apiFetch("/auth/otp/request", {
      method: "POST",
      body: JSON.stringify({ phone, purpose, name }),
    });
  };

  const verifyOtp = async (phone: string, code: string, name?: string) => {
    const r = await apiFetch("/auth/otp/verify", {
      method: "POST",
      body: JSON.stringify({ phone, code, name }),
    });
    await saveToken(r.access_token);
    setUser(r.user);
    return r.user as User;
  };

  const logout = async () => { await clearToken(); setUser(null); };

  return (
    <Ctx.Provider value={{ user, ready, requestOtp, verifyOtp, logout, refresh, setUser }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() { return useContext(Ctx); }

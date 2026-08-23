import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { authApi, tokenStore, ApiError, setUnauthorizedHandler, type Role, type LoginResponse } from "@/api";

export interface SessionUser {
  staffId: string;
  fullName: string;
  role: Role;
  mustResetPassword: boolean;
}

interface AuthContextValue {
  ready: boolean;
  user: SessionUser | null;
  token: string | null;
  login: (email: string, password: string) => Promise<{ ok: boolean; mustReset?: boolean; error?: string }>;
  logout: () => void;
  completeReset: (currentPassword: string, newPassword: string) => Promise<{ ok: boolean; error?: string }>;
  can: (roles: Role[]) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const USER_KEY = "adom_user";

function readStoredUser(): SessionUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as SessionUser) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<SessionUser | null>(null);
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const t = tokenStore.get();
    const u = readStoredUser();
    if (t && u) {
      setToken(t);
      setUser(u);
    }
    setReady(true);
  }, []);

  const logout = useCallback(() => {
    tokenStore.clear();
    localStorage.removeItem(USER_KEY);
    setUser(null);
    setToken(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      localStorage.removeItem(USER_KEY);
      setUser(null);
      setToken(null);
    });
  }, []);

  const login: AuthContextValue["login"] = async (email, password) => {
    try {
      const res: LoginResponse = await authApi.login(email, password);
      const su: SessionUser = {
        staffId: res.staffId,
        fullName: res.fullName,
        role: res.role,
        mustResetPassword: res.mustResetPassword,
      };
      tokenStore.set(res.token);
      localStorage.setItem(USER_KEY, JSON.stringify(su));
      setToken(res.token);
      setUser(su);
      return { ok: true, mustReset: res.mustResetPassword };
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Login failed";
      return { ok: false, error: msg };
    }
  };

  const completeReset: AuthContextValue["completeReset"] = async (currentPassword, newPassword) => {
    try {
      await authApi.changePassword(currentPassword, newPassword);
      if (user) {
        const updated = { ...user, mustResetPassword: false };
        localStorage.setItem(USER_KEY, JSON.stringify(updated));
        setUser(updated);
      }
      return { ok: true };
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : "Password change failed";
      return { ok: false, error: msg };
    }
  };

  const can = (roles: Role[]) => !!user && roles.includes(user.role);

  return (
    <AuthContext.Provider value={{ ready, user, token, login, logout, completeReset, can }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

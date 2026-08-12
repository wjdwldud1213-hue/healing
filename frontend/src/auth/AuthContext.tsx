import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { api, setUnauthorizedHandler } from "../api/client";
import type { Employee } from "../types";

type AuthState = {
  currentUser: Employee | null;
  loading: boolean;
  login: (employeeId: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const me = await api.get<Employee>("/auth/me");
      setCurrentUser(me);
    } catch {
      setCurrentUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // 세션이 만료(자동 로그아웃 포함)된 순간 어느 화면에 있든 즉시 로그아웃 상태로 전환한다.
    setUnauthorizedHandler(() => setCurrentUser(null));
    refresh();
    return () => setUnauthorizedHandler(null);
  }, [refresh]);

  async function login(employeeId: string, password: string) {
    const { employee } = await api.post<{ employee: Employee }>("/auth/login", {
      employeeId,
      password,
    });
    setCurrentUser(employee);
  }

  async function logout() {
    await api.post("/auth/logout");
    setCurrentUser(null);
  }

  return (
    <AuthContext.Provider value={{ currentUser, loading, login, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth는 AuthProvider 안에서만 사용할 수 있습니다.");
  return ctx;
}

import React, { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { api, setAccessToken } from "./api";
import { User, UserRole } from "@tidebook/shared";

interface AuthState {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Try to refresh on mount to restore session
    api
      .post("/auth/refresh")
      .then((res) => {
        setAccessToken(res.data.accessToken);
        // Decode user from token
        const payload = JSON.parse(atob(res.data.accessToken.split(".")[1]));
        setUser({ id: payload.sub, role: payload.role as UserRole, email: "", isActive: true, lastLoginAt: null });
      })
      .catch(() => {
        setAccessToken(null);
      })
      .finally(() => setIsLoading(false));
  }, []);

  const login = async (email: string, password: string) => {
    const { data } = await api.post("/auth/login", { email, password });
    setAccessToken(data.accessToken);
    setUser(data.user);
  };

  const logout = async () => {
    await api.post("/auth/logout");
    setAccessToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

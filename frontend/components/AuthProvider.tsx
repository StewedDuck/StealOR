"use client";

import { SessionProvider } from "next-auth/react";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  buildUserFromGmail,
  readStoredUser,
  writeStoredUser,
  type AuthUser,
} from "@/lib/auth";

type AuthContextValue = {
  user: AuthUser | null;
  ready: boolean;
  loginWithGmail: (email: string) => AuthUser;
  logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export default function AuthProvider({ children } : {children: ReactNode}) {
  return <SessionProvider>{children}</SessionProvider>
}

// export function AuthProvider({ children }: { children: ReactNode }) {
//   const [user, setUser] = useState<AuthUser | null>(null);
//   const [ready, setReady] = useState(false);

//   useEffect(() => {
//     setUser(readStoredUser());
//     setReady(true);
//   }, []);

//   const loginWithGmail = useCallback((email: string) => {
//     const next = buildUserFromGmail(email);
//     writeStoredUser(next);
//     setUser(next);
//     return next;
//   }, []);

//   const logout = useCallback(() => {
//     writeStoredUser(null);
//     setUser(null);
//   }, []);

//   const value = useMemo(
//     () => ({ user, ready, loginWithGmail, logout }),
//     [user, ready, loginWithGmail, logout]
//   );

//   return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
// }

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

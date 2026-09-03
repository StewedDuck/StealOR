import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Google({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    }),
  ],
});

export type AccountRole = "contractor" | "admin";

export type AuthUser = {
  email: string;
  name: string;
  initials: string;
  accountRole: AccountRole;
};

export const AUTH_STORAGE_KEY = "stealors_auth_user";

/** Gmail addresses that unlock the admin console. */
export const ADMIN_GMAILS = [
  "admin@gmail.com",
  "stealors.admin@gmail.com",
  "cooldogng@gmail.com"
];

export function isAdminGmail(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  return ADMIN_GMAILS.includes(normalized);
}

export function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function nameFromEmail(email: string): string {
  const local = email.split("@")[0] || "User";
  return local
    .replace(/[._-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function buildUserFromGmail(email: string): AuthUser {
  const normalized = email.trim().toLowerCase();
  const accountRole: AccountRole = isAdminGmail(normalized)
    ? "admin"
    : "contractor";
  const name = nameFromEmail(normalized);
  return {
    email: normalized,
    name,
    initials: initialsFromName(name),
    accountRole,
  };
}

export function readStoredUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AuthUser;
    if (!parsed?.email || !parsed?.accountRole) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeStoredUser(user: AuthUser | null) {
  if (typeof window === "undefined") return;
  if (!user) {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    return;
  }
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(user));
}

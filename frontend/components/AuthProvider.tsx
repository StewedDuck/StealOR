"use client";

import { SessionProvider, useSession, signOut as nextAuthSignOut } from "next-auth/react";
import {
    createContext,
    useContext,
    useEffect,
    useState,
    type ReactNode,
} from "react";

import {
    type AuthUser,
    buildUserFromGmail,
} from "@/lib/auth";

type AuthContextValue = {
    user: AuthUser | null;
    ready: boolean;
    loginWithGmail: (email: string) => AuthUser;
    logout: () => void;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function AuthContextProvider({ children }: { children: ReactNode }) {
    const { data: session, status } = useSession();

    const [user, setUser] = useState<AuthUser | null>(null);

    useEffect(() => {
        if (status === "loading") return;

        if (session?.user?.email) {
            const authUser = buildUserFromGmail(session.user.email);

            setUser(authUser);
            localStorage.setItem(
                "stealors_auth_user",
                JSON.stringify(authUser)
            );
        } else {
            setUser(null);
            localStorage.removeItem("stealors_auth_user");
        }
    }, [session, status]);

    function loginWithGmail(email: string): AuthUser {
        const authUser = buildUserFromGmail(email);

        setUser(authUser);

        localStorage.setItem(
            "stealors_auth_user",
            JSON.stringify(authUser)
        );

        return authUser;
    }

    async function logout() {
        setUser(null);
        localStorage.removeItem("stealors_auth_user");

        await nextAuthSignOut({
            callbackUrl: "/",
        });
    }

    const ready = status !== "loading";

    return (
        <AuthContext.Provider
            value={{
                user,
                ready,
                loginWithGmail,
                logout,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
}

export default function AuthProvider({
    children,
}: {
    children: ReactNode;
}) {
    return (
        <SessionProvider>
            <AuthContextProvider>
                {children}
            </AuthContextProvider>
        </SessionProvider>
    );
}

export function useAuth() {
    const ctx = useContext(AuthContext);

    if (!ctx) {
        throw new Error("useAuth must be used within AuthProvider");
    }

    return ctx;
}
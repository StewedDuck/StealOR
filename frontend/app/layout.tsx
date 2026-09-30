import type { Metadata } from "next";
import AuthProvider from "@/components/AuthProvider"
import ToastProvider from "@/components/toast/ToastProvider";
import "./globals.css";

export const metadata: Metadata = {
  title: "sTealORs — TOR Discovery & Match Intelligence",
  description: "ค้นหา TOR · กรุงเทพฯ",
};

export default function RootLayout(
  { children }: Readonly<{ children: React.ReactNode; }>)
  {
  return (
    <html lang="th">
      <body>
        <AuthProvider><ToastProvider>{children}</ToastProvider></AuthProvider>
      </body>
    </html>
  );
}

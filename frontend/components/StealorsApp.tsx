"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";

declare global {
  interface Window {
    __STEALORS_AUTH__?: {
      // accountRole: "contractor" | "admin";
      name: string;
      // initials: string;
      email: string;
    };
    __stealorsLogout?: () => void;
  }
}

// export default function StealorsApp() {
//   const { user, logout, ready } = useAuth();
//   const router = useRouter();
//   const [hostEl, setHostEl] = useState<HTMLDivElement | null>(null);

//   useEffect(() => {
//     if (!ready) return;
//     if (!user) {
//       router.replace("/login");
//     }
//   }, [ready, user, router]);

//   useEffect(() => {
//     if (!ready || !user || !hostEl) return;

//     window.__STEALORS_AUTH__ = {
//       accountRole: user.accountRole,
//       name: user.name,
//       initials: user.initials,
//       email: user.email,
//     };
//     window.__stealorsLogout = () => {
//       logout();
//       router.replace("/login");
//     };

//     let cancelled = false;
//     const injectedScripts: HTMLScriptElement[] = [];

//     (async () => {
//       try {
//         const [bodyRes, scriptRes] = await Promise.all([
//           fetch("/mockup-body.html"),
//           fetch("/mockup-app.js"),
//         ]);
//         const bodyHtml = await bodyRes.text();
//         const scriptText = await scriptRes.text();
//         if (cancelled) return;

//         hostEl.innerHTML = bodyHtml;

//         const script = document.createElement("script");
//         script.id = "stealors-app-script";
        
//         script.textContent = `
//           (() => {
//             ${scriptText}
//           })();
//         `;
        
//         document.body.appendChild(script);
//         injectedScripts.push(script);

//       } catch (err) {
//         console.error("Failed to boot StealorsApp", err);
//       }
//     })();

//     return () => {
//       cancelled = true;
//       hostEl.innerHTML = "";
//       injectedScripts.forEach((script) => script.remove());
//       delete window.__STEALORS_AUTH__;
//       delete window.__stealorsLogout;
//     };
//   }, [ready, user, hostEl, logout, router]);

//   if (!ready || !user) {
//     return (
//       <div style={{ padding: 40, fontFamily: "var(--font-body)" }}>
//         กำลังโหลด...
//       </div>
//     );
//   }

//   return <div ref={setHostEl} />;
// }

export default function StealorsApp() {
  const { data: session, status } = useSession();
  const ready = status !== "loading";
  const user = session?.user;
  const router = useRouter();
  const [hostEl, setHostEl] = useState<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!ready) return;
    if (!user) {
      router.replace("/login");
    }
  }, [ready, user, router]);

  useEffect(() => {
    if (!ready || !user || !hostEl) return;

    window.__STEALORS_AUTH__ = {
      name: user.name ?? "",
      email: user.email ?? "",
    };
    window.__stealorsLogout = () => {
      signOut({ callbackUrl: "/login" });
    };

    let cancelled = false;
    const injectedScripts: HTMLScriptElement[] = [];

    (async () => {
      try {
        const [bodyRes, scriptRes] = await Promise.all([
          fetch("/mockup-body.html"),
          fetch("/mockup-app.js"),
        ]);
        const bodyHtml = await bodyRes.text();
        const scriptText = await scriptRes.text();
        if (cancelled) return;

        hostEl.innerHTML = bodyHtml;

        const script = document.createElement("script");
        script.id = "stealors-app-script";
        script.textContent = `(() => { ${scriptText}}) ();`;
        document.body.appendChild(script);
        injectedScripts.push(script);
      } catch (err) {
        console.error("Failed to boot StealorsApp", err);
      }})();

      return () => {
        cancelled = true;
        hostEl.innerHTML = "";
        injectedScripts.forEach((script) => script.remove());
        delete window.__STEALORS_AUTH__;
        delete window.__stealorsLogout;
      };
    }, [ready, user, hostEl]);

  if (!ready || !user) {
    return (
      <div style={{ padding: 40, fontFamily: "var(--font-body)" }}>
        กำลังโหลด...
      </div>
    );
  }

  return <div ref={setHostEl} />;
}


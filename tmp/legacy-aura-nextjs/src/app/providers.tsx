import type { ReactNode } from "react";
import { AuraProviderShell } from "@/aura/server/manifest-injector";
import { ClientShell } from "./client-shell";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <AuraProviderShell
      config={{
        csrfCookieName: process.env.NEXT_PUBLIC_AURA_CSRF_COOKIE_NAME || "aura_csrf",
      }}
    >
      <ClientShell>{children}</ClientShell>
    </AuraProviderShell>
  );
}

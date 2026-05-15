"use client";

import type { ReactNode } from "react";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { Toaster } from "@/components/ui/sonner";

/**
 * Client-only part of the providers tree. Sits inside the server component
 * `<AuraProviderShell>` so that it benefits from the SSR-injected Aura
 * manifest while still hosting client-only providers (theme, toasts).
 */
export function ClientShell({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      {children}
      <Toaster richColors closeButton />
    </ThemeProvider>
  );
}

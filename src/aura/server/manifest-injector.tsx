
import "@/aura.registry";

import type { ReactNode } from "react";
import { AuraClientProvider, type AuraClientProviderProps } from "@/aura/client/provider";
import { getClientOperationManifest } from "./registry";

/**
 * RSC wrapper that serializes the Aura operation manifest server-side
 * and hands it to the client provider. This eliminates the race where
 * the client had to fetch the manifest after mounting — during that
 * window, any invalidation arriving via WebSocket could only match
 * by operation name (entity-based matching was silently skipped).
 */
export function AuraProviderShell({
  children,
  ...props
}: Omit<AuraClientProviderProps, "initialManifest"> & {
  children: ReactNode;
}) {
  const manifest = getClientOperationManifest();

  return (
    <AuraClientProvider {...props} initialManifest={manifest}>
      {children}
    </AuraClientProvider>
  );
}

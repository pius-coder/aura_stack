/**
 * `<AuraBumpToaster>` — auto-displays server-side bumps as sonner toasts.
 * Resolves: Requirements 38.3, 38.4.
 *
 * Mount once in the root layout. Automatically consumes `bumps` from
 * `AuraEnvelope.meta.bumps` after every mutation response.
 */

"use client";

import { useEffect } from "react";
import { toast, Toaster } from "sonner";

export interface AuraBumpToasterProps {
  position?:
    | "top-left"
    | "top-right"
    | "bottom-left"
    | "bottom-right"
    | "top-center"
    | "bottom-center";
  richColors?: boolean;
}

let pendingBumps: Array<{ variant: string; title: string; description?: string }> = [];

export function pushBumps(
  bumps: Array<{ variant: string; title: string; description?: string }>,
): void {
  pendingBumps.push(...bumps);
}

export function AuraBumpToaster({
  position = "bottom-right",
  richColors = true,
}: AuraBumpToasterProps = {}) {
  useEffect(() => {
    const interval = setInterval(() => {
      if (pendingBumps.length === 0) return;
      const bumps = [...pendingBumps];
      pendingBumps = [];
      for (const bump of bumps) {
        switch (bump.variant) {
          case "success":
            toast.success(bump.title, { description: bump.description });
            break;
          case "error":
            toast.error(bump.title, { description: bump.description });
            break;
          case "warning":
            toast.warning(bump.title, { description: bump.description });
            break;
          default:
            toast.info(bump.title, { description: bump.description });
            break;
        }
      }
    }, 100);
    return () => clearInterval(interval);
  }, []);

  return <Toaster position={position} richColors={richColors} />;
}

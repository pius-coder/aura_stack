/**
 * `<AuraGuardView>` — page wrapper showing loading/unauthorized states.
 */
"use client";

import { AuraGuard, type AuraGuardProps } from "@/aura/client/guard";

export interface AuraGuardViewProps extends AuraGuardProps {
  unauthorizedMessage?: string;
}

export function AuraGuardView({ children, unauthorizedMessage, ...props }: AuraGuardViewProps) {
  return (
    <AuraGuard
      {...props}
      unauthenticatedFallback={
        <div className="flex min-h-[50vh] items-center justify-center">
          <div className="text-center">
            <h2 className="text-lg font-semibold">Accès non autorisé</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {unauthorizedMessage ?? "Vous n'avez pas les permissions nécessaires."}
            </p>
          </div>
        </div>
      }
      loadingFallback={
        <div className="flex min-h-[50vh] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      }
    >
      {children}
    </AuraGuard>
  );
}

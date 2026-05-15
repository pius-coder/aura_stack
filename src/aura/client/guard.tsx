"use client";

import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import type { ReactNode } from "react";
import { useAuraQuery } from "./hooks";
import type { AuthSessionResult } from "@/aura/shared/auth-types";

export interface AuraGuardProps {
  children: ReactNode;
  /**
   * Composant affiché pendant le chargement de l'état d'authentification.
   * Par défaut : spinner simple.
   */
  loadingFallback?: ReactNode;
  /**
   * Composant affiché si l'utilisateur n'est pas authentifié.
   * Si `redirectTo` est défini, ce fallback n'est pas utilisé
   * (la redirection se fait automatiquement).
   */
  unauthenticatedFallback?: ReactNode;
  /**
   * URL de redirection si l'utilisateur n'est pas authentifié.
   * Exécute `router.push(redirectTo)` côté client.
   */
  redirectTo?: string;
  /**
   * Nom de l'opération à utiliser pour vérifier l'authentification.
   * Par défaut : `"auth.me"`.
   */
  authOperationName?: string;
}

/**
 * Wrapper client qui sécurise l'affichage d'un composant
 * en vérifiant l'état d'authentification via une opération Aura.
 *
 * Affiche un fallback pendant le chargement ou si non authentifié.
 * Peut rediriger automatiquement vers une page de connexion.
 *
 * Usage :
 * ```tsx
 * <AuraGuard redirectTo="/login">
 *   <DashboardContent />
 * </AuraGuard>
 * ```
 *
 * Ou avec un fallback personnalisé :
 * ```tsx
 * <AuraGuard
 *   loadingFallback={<Skeleton />}
 *   unauthenticatedFallback={<LoginPrompt />}
 * >
 *   <ProtectedContent />
 * </AuraGuard>
 * ```
 */
export function AuraGuard({
  children,
  loadingFallback,
  unauthenticatedFallback,
  redirectTo,
  authOperationName = "auth.me",
}: AuraGuardProps) {
  const navigate = useNavigate();
  const auth = useAuraQuery<AuthSessionResult>(authOperationName, {
    retry: false,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (auth.isError && redirectTo) {
      navigate({ to: redirectTo });
    }
  }, [auth.isError, redirectTo, navigate]);

  if (auth.isPending) {
    return (
      <>{loadingFallback ?? <DefaultLoadingFallback />}</>
    );
  }

  if (auth.isError) {
    if (redirectTo) return null;
    return (
      <>
        {unauthenticatedFallback ?? (
          <DefaultUnauthenticatedFallback />
        )}
      </>
    );
  }

  return <>{children}</>;
}

function DefaultLoadingFallback() {
  return (
    <div className="flex min-h-[200px] items-center justify-center">
      <div className="h-6 w-8 animate-spin rounded-md border-4 border-primary border-t-transparent" />
    </div>
  );
}

function DefaultUnauthenticatedFallback() {
  return (
    <div className="flex min-h-[200px] flex-col items-center justify-center gap-3 text-muted-foreground">
      <p className="text-sm">Vous devez être connecté pour accéder à cette page.</p>
    </div>
  );
}

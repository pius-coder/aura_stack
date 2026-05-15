"use client";

import {
  HydrationBoundary,
  type DehydratedState,
} from "@tanstack/react-query";
import type { ReactNode } from "react";

export interface AuraHydrationBoundaryProps {
  state: DehydratedState;
  children: ReactNode;
}

/**
 * Composant client qui reçoit un état déshydraté de TanStack Query
 * et réhydrate le cache côté client.
 *
 * Utilisé en combinaison avec le composant serveur `<AuraHydration>`.
 */
export function AuraHydrationBoundary({
  state,
  children,
}: AuraHydrationBoundaryProps) {
  return <HydrationBoundary state={state}>{children}</HydrationBoundary>;
}

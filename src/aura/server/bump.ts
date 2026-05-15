

import type { AuraBump, AuraBumpVariant } from "@/aura/core/envelope";

export function createBumpStore() {
  const bumps: AuraBump[] = [];

  const add = (variant: AuraBumpVariant, title: string, description?: string) => {
    bumps.push({ variant, title, description });
  };

  return {
    add,
    success(title: string, description?: string) {
      add("success", title, description);
    },
    info(title: string, description?: string) {
      add("info", title, description);
    },
    warning(title: string, description?: string) {
      add("warning", title, description);
    },
    error(title: string, description?: string) {
      add("error", title, description);
    },
    all() {
      return [...bumps];
    },
  };
}

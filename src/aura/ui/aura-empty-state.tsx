/**
 * `<AuraEmptyState>` — empty state placeholder using shadcn Empty primitive.
 */
import type { ReactNode } from "react";
import { Button } from "@/aura/ui/button";
import { cn } from "@/lib/utils";

export interface AuraEmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
  className?: string;
}

export function AuraEmptyState({ icon, title, description, action, className }: AuraEmptyStateProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center py-12 text-center", className)}>
      {icon && <div className="text-muted-foreground mb-4">{icon}</div>}
      <h3 className="text-lg font-semibold">{title}</h3>
      {description && (
        <p className="text-muted-foreground mt-2 max-w-sm text-sm">{description}</p>
      )}
      {action && (
        <Button onClick={action.onClick} className="mt-4">
          {action.label}
        </Button>
      )}
    </div>
  );
}

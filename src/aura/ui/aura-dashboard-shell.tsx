/**
 * `<AuraDashboardShell>` — dashboard layout (nav + header + content).
 */
"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Separator } from "@/aura/ui/separator";

export interface AuraDashboardNavItem {
  label: string;
  href?: string;
  active?: boolean;
  icon?: ReactNode;
  onClick?: () => void;
}

export interface AuraDashboardShellProps {
  brand?: ReactNode;
  nav: AuraDashboardNavItem[];
  header?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function AuraDashboardShell({ brand, nav, header, children, className }: AuraDashboardShellProps) {
  return (
    <div className={cn("flex min-h-screen", className)}>
      <aside className="bg-muted/30 hidden w-64 shrink-0 flex-col border-r md:flex">
        {brand && <div className="px-4 py-4">{brand}</div>}
        <Separator />
        <nav className="flex-1 space-y-1 p-3">
          {nav.map((item, i) => {
            const Element = item.href ? "a" : "button";
            return (
              <Element
                key={i}
                href={item.href}
                onClick={item.onClick}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                  item.active
                    ? "bg-background font-medium shadow-sm"
                    : "text-muted-foreground hover:bg-background/50 hover:text-foreground",
                )}
              >
                {item.icon}
                {item.label}
              </Element>
            );
          })}
        </nav>
      </aside>
      <div className="flex flex-1 flex-col">
        {header && <header className="bg-background flex h-14 items-center border-b px-6">{header}</header>}
        <main className="flex-1 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}

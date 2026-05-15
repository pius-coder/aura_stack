/**
 * `<AuraSettingsLayout>` — sidebar + content settings layout.
 */
"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface AuraSettingsNavItem {
  label: string;
  href?: string;
  active?: boolean;
  icon?: ReactNode;
  onClick?: () => void;
}

export interface AuraSettingsLayoutProps {
  title?: string;
  description?: string;
  nav: AuraSettingsNavItem[];
  children: ReactNode;
  className?: string;
}

export function AuraSettingsLayout({ title = "Paramètres", description, nav, children, className }: AuraSettingsLayoutProps) {
  return (
    <div className={cn("container mx-auto py-8", className)}>
      <div className="mb-8">
        <h1 className="text-2xl font-bold">{title}</h1>
        {description && <p className="text-muted-foreground mt-1 text-sm">{description}</p>}
      </div>
      <div className="grid gap-8 md:grid-cols-[200px_1fr]">
        <aside>
          <nav className="space-y-1">
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
                      ? "bg-muted font-medium"
                      : "text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                  )}
                >
                  {item.icon}
                  {item.label}
                </Element>
              );
            })}
          </nav>
        </aside>
        <main>{children}</main>
      </div>
    </div>
  );
}

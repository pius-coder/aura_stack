/**
 * `<AuraSearchInput>` — debounced search input using shadcn Input.
 */
"use client";

import { useState, useEffect, useRef } from "react";
import { Input } from "@/aura/ui/input";

export interface AuraSearchInputProps {
  onSearch: (query: string) => void;
  placeholder?: string;
  debounceMs?: number;
  className?: string;
  defaultValue?: string;
}

export function AuraSearchInput({
  onSearch,
  placeholder = "Rechercher...",
  debounceMs = 300,
  className,
  defaultValue = "",
}: AuraSearchInputProps) {
  const [value, setValue] = useState(defaultValue);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => onSearch(value), debounceMs);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [value, debounceMs, onSearch]);

  return (
    <Input
      type="search"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      placeholder={placeholder}
      className={className}
    />
  );
}

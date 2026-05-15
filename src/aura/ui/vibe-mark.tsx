/**
 * `<VibeMark>` — Vibe wordmark.
 *
 * Strict 60-30-10 system: monochrome glyph, single accent dot. No rainbow.
 * The "v" mark is a custom geometric shape, not generated, with a single
 * accent dot acting as the `i` accent — the only chromatic note in the
 * brand mark. Inspired by the discipline of antigravity.google and runey.app.
 */

import { cn } from "@/lib/utils";

export type VibeMarkProps = {
  className?: string;
  size?: number;
  showWordmark?: boolean;
};

export function VibeMark({
  className,
  size = 28,
  showWordmark = true,
}: VibeMarkProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-2 text-[var(--vibe-fg)]",
        className,
      )}
    >
      <svg
        aria-hidden="true"
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill="none"
        className="shrink-0"
      >
        {/* Soft circular ground */}
        <circle cx="16" cy="16" r="15.5" stroke="currentColor" strokeOpacity="0.16" />
        {/* "v" glyph */}
        <path
          d="M9 11 L16 22 L23 11"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Single accent dot — the 10% */}
        <circle cx="23" cy="9.4" r="2.1" fill="var(--vibe-accent)" />
      </svg>
      {showWordmark && (
        <span className="text-[15px] font-semibold tracking-[-0.01em]">
          Vibe
        </span>
      )}
    </span>
  );
}

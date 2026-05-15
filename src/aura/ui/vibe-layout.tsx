/**
 * `<VibeLayout>` — chrome for Vibe public/auth pages.
 *
 * Sober dark layout following the 60-30-10 rule:
 *  - 60% near-black background (set on <html data-vibe-page>)
 *  - 30% surface chrome (header / footer)
 *  - 10% accent for CTA only
 *
 * Header: wordmark + minimal nav + single accent CTA.
 * Footer: 4-col grid, neutral, no rainbow.
 */

import { Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { VibeMark } from "./vibe-mark";

export type VibeLayoutProps = {
  children: React.ReactNode;
  /** Hide the public navigation (used on /sign-in, /sign-up). */
  hideNav?: boolean;
};

export function VibeLayout({ children, hideNav = false }: VibeLayoutProps) {
  useEffect(() => {
    const html = document.documentElement;
    html.setAttribute("data-vibe-page", "true");
    return () => {
      html.removeAttribute("data-vibe-page");
    };
  }, []);

  return (
    <div className="min-h-screen text-[var(--vibe-fg)]">
      <VibeHeader hideNav={hideNav} />
      <main>{children}</main>
      <VibeFooter />
    </div>
  );
}

function VibeHeader({ hideNav }: { hideNav: boolean }) {
  return (
    <header className="sticky top-0 z-40 border-b border-[var(--vibe-line)] bg-[rgba(10,13,12,0.7)] backdrop-blur-xl">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-5 py-3.5 sm:px-8">
        <Link to="/" className="flex items-center no-underline">
          <VibeMark />
        </Link>

        {!hideNav && (
          <nav className="hidden items-center gap-8 text-sm text-[var(--vibe-fg-muted)] md:flex">
            <a href="#how" className="transition hover:text-[var(--vibe-fg)]">
              Comment ça marche
            </a>
            <a href="#audience" className="transition hover:text-[var(--vibe-fg)]">
              Pour qui
            </a>
            <a href="#trust" className="transition hover:text-[var(--vibe-fg)]">
              Confiance
            </a>
          </nav>
        )}

        <div className="flex items-center gap-2 sm:gap-3">
          <Link
            to="/sign-in"
            className="hidden text-sm font-medium text-[var(--vibe-fg-muted)] transition hover:text-[var(--vibe-fg)] sm:inline-flex"
          >
            Se connecter
          </Link>
          <Link to="/sign-up" className="vibe-cta px-5 text-sm">
            Démarrer
            <ArrowRightIcon />
          </Link>
        </div>
      </div>
    </header>
  );
}

function VibeFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="mt-32 border-t border-[var(--vibe-line)]">
      <div className="mx-auto grid w-full max-w-6xl gap-10 px-5 py-16 sm:px-8 md:grid-cols-[1.6fr_1fr_1fr_1fr]">
        <div>
          <VibeMark />
          <p className="mt-5 max-w-sm text-sm leading-relaxed text-[var(--vibe-fg-muted)]">
            Plateforme de mise en relation pour l'économie informelle camerounaise.
            Inscription par WhatsApp, conversations anonymes, modération active.
          </p>
        </div>

        <FooterColumn
          title="Produit"
          links={[
            { label: "Comment ça marche", href: "#how" },
            { label: "Pour qui", href: "#audience" },
            { label: "Confiance", href: "#trust" },
          ]}
        />
        <FooterColumn
          title="Compte"
          links={[
            { label: "Se connecter", href: "/sign-in" },
            { label: "S'inscrire", href: "/sign-up" },
          ]}
        />
        <FooterColumn
          title="Légal"
          links={[
            { label: "Confidentialité", href: "#" },
            { label: "Conditions", href: "#" },
            { label: "Contact", href: "#" },
          ]}
        />
      </div>

      <div className="border-t border-[var(--vibe-line)]">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-start justify-between gap-2 px-5 py-5 text-xs text-[var(--vibe-fg-subtle)] sm:flex-row sm:items-center sm:px-8">
          <p>© {year} Vibe. Tous droits réservés.</p>
          <p className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--vibe-accent)]" />
            Conçu à Yaoundé · Propulsé par Aura
          </p>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({
  title,
  links,
}: {
  title: string;
  links: { label: string; href: string }[];
}) {
  return (
    <div>
      <p className="mb-4 text-xs font-medium uppercase tracking-[0.08em] text-[var(--vibe-fg-subtle)]">
        {title}
      </p>
      <ul className="space-y-2.5 text-sm text-[var(--vibe-fg-muted)]">
        {links.map((l) => (
          <li key={l.label}>
            <a href={l.href} className="transition hover:text-[var(--vibe-fg)]">
              {l.label}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ArrowRightIcon() {
  return (
    <svg
      aria-hidden="true"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  );
}

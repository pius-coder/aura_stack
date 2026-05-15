import { createFileRoute, Link } from '@tanstack/react-router'
import { VibeLayout } from '@/aura/ui/vibe-layout'

export const Route = createFileRoute('/sign-in')({ component: SignInPage })

function SignInPage() {
  return (
    <VibeLayout hideNav>
      <section className="relative mx-auto flex w-full max-w-md flex-col items-center px-5 pb-16 pt-16 sm:pt-24">
        <div className="vibe-card w-full p-8 sm:p-10">
          <span className="vibe-eyebrow">Connexion</span>
          <h1 className="vibe-display mt-3 text-3xl">Bon retour sur Vibe</h1>
          <p className="mt-3 text-sm leading-relaxed text-[var(--vibe-fg-muted)]">
            Saisissez votre numéro pour recevoir un code de connexion sur
            WhatsApp. Cette étape sera activée prochainement.
          </p>

          <div className="mt-8 space-y-3">
            <input
              disabled
              placeholder="+237 6XX XX XX XX"
              className="w-full rounded-xl border border-[var(--vibe-line-strong)] bg-[var(--vibe-bg)] px-4 py-3 text-sm text-[var(--vibe-fg)] placeholder:text-[var(--vibe-fg-subtle)] focus:border-[var(--vibe-accent)] focus:outline-none"
            />
            <button
              disabled
              className="vibe-cta w-full cursor-not-allowed opacity-60"
            >
              Recevoir le code WhatsApp
            </button>
          </div>

          <p className="mt-6 text-center text-xs text-[var(--vibe-fg-subtle)]">
            Pas encore de compte ?{' '}
            <Link
              to="/sign-up"
              className="text-[var(--vibe-fg)] underline-offset-2 hover:underline"
            >
              S'inscrire
            </Link>
          </p>
        </div>

        <Link
          to="/"
          className="mt-6 text-xs text-[var(--vibe-fg-subtle)] hover:text-[var(--vibe-fg)]"
        >
          ← Retour à l'accueil
        </Link>
      </section>
    </VibeLayout>
  )
}

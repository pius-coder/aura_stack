import { createFileRoute, Link } from '@tanstack/react-router'
import { VibeLayout } from '@/aura/ui/vibe-layout'
import { VibeWhatsAppMockup } from '@/aura/ui/vibe-whatsapp-mockup'

export const Route = createFileRoute('/demo')({ component: DemoPage })

function DemoPage() {
  return (
    <VibeLayout>
      <section className="mx-auto grid w-full max-w-6xl gap-12 px-5 pb-20 pt-16 sm:px-8 sm:pt-24 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="flex flex-col justify-center">
          <span className="vibe-pill self-start">Démo publique</span>
          <h1 className="vibe-display mt-5 text-4xl sm:text-5xl">
            Testez l'assistant <span className="text-[var(--vibe-accent)]">avant de vous inscrire.</span>
          </h1>
          <p className="mt-5 max-w-lg text-base text-[var(--vibe-fg-muted)]">
            La démo arrive avec la vague IA. En attendant, voici à quoi
            ressemblera votre conversation WhatsApp avec Vibe.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link to="/sign-up" className="vibe-cta">
              Créer mon compte
            </Link>
            <Link to="/" className="vibe-cta-ghost">
              Retour à l'accueil
            </Link>
          </div>
        </div>
        <div className="flex justify-center lg:justify-end">
          <VibeWhatsAppMockup className="w-full max-w-[380px]" />
        </div>
      </section>
    </VibeLayout>
  )
}

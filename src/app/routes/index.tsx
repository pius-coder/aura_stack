import { createFileRoute, Link } from '@tanstack/react-router'
import { VibeLayout } from '@/aura/ui/vibe-layout'
import { VibeWhatsAppMockup } from '@/aura/ui/vibe-whatsapp-mockup'

export const Route = createFileRoute('/')({ component: LandingPage })

function LandingPage() {
  return (
    <VibeLayout>
      <Hero />
      <Stats />
      <HowItWorks />
      <Audience />
      <Trust />
      <FinalCta />
    </VibeLayout>
  )
}

/* ─────────────────────────────────────────────────────────────────
 * Hero — split layout, WhatsApp mockup on the right.
 * 60% near-black surface, 30% chrome, 10% accent CTA only.
 * ───────────────────────────────────────────────────────────────── */

function Hero() {
  return (
    <section className="relative overflow-hidden">
      {/* Single soft accent glow, no rainbow */}
      <div
        className="vibe-glow"
        style={{ '--glow-x': '70%', '--glow-y': '5%' } as React.CSSProperties}
      />

      <div className="relative mx-auto grid w-full max-w-6xl gap-12 px-5 pb-20 pt-16 sm:px-8 sm:pt-24 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
        <div className="flex flex-col justify-center">
          <span className="vibe-reveal vibe-pill self-start">
            <Dot />
            Cameroun · Inscription gratuite
          </span>

          <h1 className="vibe-reveal vibe-reveal-delay-1 vibe-display mt-6 text-[2.5rem] sm:text-[3.5rem] lg:text-[4.25rem]">
            Le bon prestataire,
            <br className="hidden sm:block" />
            <span className="text-[var(--vibe-accent)]">trouvé sur WhatsApp.</span>
          </h1>

          <p className="vibe-reveal vibe-reveal-delay-2 mt-6 max-w-xl text-base leading-relaxed text-[var(--vibe-fg-muted)] sm:text-lg">
            Décrivez votre besoin à votre assistant Vibe. Il vous propose 3 à 5
            profils vérifiés. Vous discutez de manière anonyme, sans jamais
            partager votre numéro.
          </p>

          <div className="vibe-reveal vibe-reveal-delay-3 mt-10 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
            <Link to="/sign-up" className="vibe-cta">
              Commencer maintenant
              <ArrowRight />
            </Link>
            <a href="#how" className="vibe-cta-ghost">
              Voir comment ça marche
            </a>
          </div>

          <div className="vibe-reveal vibe-reveal-delay-4 mt-8 flex items-center gap-5 text-xs text-[var(--vibe-fg-subtle)]">
            <span className="flex items-center gap-1.5">
              <Check />
              Aucun mot de passe
            </span>
            <span className="flex items-center gap-1.5">
              <Check />
              Code par WhatsApp
            </span>
            <span className="flex items-center gap-1.5">
              <Check />
              100% anonyme
            </span>
          </div>
        </div>

        {/* WhatsApp mockup — proof, not decoration */}
        <div className="vibe-reveal vibe-reveal-delay-2 flex justify-center lg:justify-end">
          <VibeWhatsAppMockup className="w-full max-w-[380px]" />
        </div>
      </div>
    </section>
  )
}

/* ─────────────────────────────────────────────────────────────────
 * Stats — restrained, monochrome row of 4 numbers
 * ───────────────────────────────────────────────────────────────── */

function Stats() {
  const items = [
    { value: '< 3 min', label: 'Temps moyen jusqu\'à un match' },
    { value: '100%', label: 'Conversations anonymes' },
    { value: 'FR + EN', label: 'Bot multilingue' },
    { value: 'Gratuit', label: 'Pendant la phase MVP' },
  ]
  return (
    <section className="border-y border-[var(--vibe-line)]">
      <div className="mx-auto grid w-full max-w-6xl grid-cols-2 divide-y divide-[var(--vibe-line)] px-5 sm:grid-cols-4 sm:divide-x sm:divide-y-0 sm:px-8">
        {items.map((s, i) => (
          <div
            key={s.label}
            className={`flex flex-col gap-1.5 px-4 py-7 sm:py-9 ${
              i % 2 === 1 ? 'border-l border-[var(--vibe-line)] sm:border-l-0' : ''
            }`}
          >
            <p className="vibe-display text-2xl sm:text-3xl">{s.value}</p>
            <p className="text-xs text-[var(--vibe-fg-subtle)] sm:text-sm">
              {s.label}
            </p>
          </div>
        ))}
      </div>
    </section>
  )
}

/* ─────────────────────────────────────────────────────────────────
 * How it works — 4 numbered steps, monochrome with a single accent bar
 * ───────────────────────────────────────────────────────────────── */

function HowItWorks() {
  const steps = [
    {
      n: '01',
      title: 'Inscrivez-vous avec votre numéro',
      body:
        "Aucun email, aucun mot de passe. Saisissez votre numéro WhatsApp et recevez votre code de connexion sur WhatsApp.",
    },
    {
      n: '02',
      title: 'Discutez avec votre assistant',
      body:
        "Décrivez votre besoin en langage naturel. L'assistant Vibe apprend vos préférences à chaque échange.",
    },
    {
      n: '03',
      title: 'Recevez 3 à 5 propositions',
      body:
        "Compétences, localisation et réputation se combinent pour proposer un mélange équilibré de profils pertinents.",
    },
    {
      n: '04',
      title: 'Connectez-vous en sécurité',
      body:
        "Demande de connexion en un message. Le prestataire valide. Vous discutez sur le web sans échanger de numéro.",
    },
  ]

  return (
    <section id="how" className="mx-auto w-full max-w-6xl px-5 py-28 sm:px-8">
      <div className="mb-14 max-w-2xl">
        <span className="vibe-eyebrow">Comment ça marche</span>
        <h2 className="vibe-display mt-3 text-3xl sm:text-5xl">
          Quatre étapes. Aucune friction.
        </h2>
        <p className="mt-5 max-w-xl text-base text-[var(--vibe-fg-muted)]">
          Conçu pour fonctionner sur le téléphone que vous avez déjà,
          sans application supplémentaire à installer.
        </p>
      </div>

      <ol className="grid gap-px overflow-hidden rounded-2xl border border-[var(--vibe-line)] bg-[var(--vibe-line)] sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((step, i) => (
          <li
            key={step.n}
            className="flex flex-col gap-4 bg-[var(--vibe-bg-2)] p-7"
          >
            <div className="flex items-center gap-3">
              <span className="font-mono text-xs font-medium text-[var(--vibe-fg-subtle)]">
                {step.n}
              </span>
              {i === 0 && (
                <span className="h-px flex-1 bg-gradient-to-r from-[var(--vibe-accent)] via-transparent to-transparent" />
              )}
            </div>
            <h3 className="text-base font-semibold leading-snug text-[var(--vibe-fg)]">
              {step.title}
            </h3>
            <p className="text-sm leading-relaxed text-[var(--vibe-fg-muted)]">
              {step.body}
            </p>
          </li>
        ))}
      </ol>
    </section>
  )
}

/* ─────────────────────────────────────────────────────────────────
 * Audience — three cards, monochrome with restrained iconography
 * ───────────────────────────────────────────────────────────────── */

function Audience() {
  const personas = [
    {
      tag: 'Pour les clients',
      title: 'Trouvez le bon prestataire, sans le bouche-à-oreille',
      points: [
        'Décrivez votre besoin en langage naturel',
        'Comparez 3 à 5 profils anonymisés',
        'Notez après mission pour aider la communauté',
      ],
    },
    {
      tag: 'Pour les prestataires',
      title: "Soyez visible auprès des bons clients",
      points: [
        'Publiez vos services et zones d\'intervention',
        'Recevez des demandes ciblées sur WhatsApp',
        'Bâtissez votre réputation par les notes reçues',
      ],
    },
    {
      tag: 'Pour tout le monde',
      title: 'Un seul compte, deux usages',
      points: [
        'Cumulez les rôles client et prestataire',
        'Conversations chiffrées, photos masquées',
        'Modération active 24/7',
      ],
    },
  ]

  return (
    <section id="audience" className="mx-auto w-full max-w-6xl px-5 py-28 sm:px-8">
      <div className="mb-14 max-w-2xl">
        <span className="vibe-eyebrow">Pour qui</span>
        <h2 className="vibe-display mt-3 text-3xl sm:text-5xl">
          Conçu pour l'économie réelle.
        </h2>
      </div>

      <div className="grid gap-5 lg:grid-cols-3">
        {personas.map((p) => (
          <article
            key={p.tag}
            className="vibe-card flex flex-col p-7 transition hover:border-[var(--vibe-line-strong)]"
          >
            <span className="vibe-eyebrow">{p.tag}</span>
            <h3 className="vibe-display mt-3 text-xl leading-snug">{p.title}</h3>
            <ul className="mt-6 space-y-3 border-t border-[var(--vibe-line)] pt-5">
              {p.points.map((pt) => (
                <li
                  key={pt}
                  className="flex items-start gap-2.5 text-sm text-[var(--vibe-fg-muted)]"
                >
                  <Check />
                  <span>{pt}</span>
                </li>
              ))}
            </ul>
          </article>
        ))}
      </div>
    </section>
  )
}

/* ─────────────────────────────────────────────────────────────────
 * Trust — four neutral cards, no chromatic noise
 * ───────────────────────────────────────────────────────────────── */

function Trust() {
  const items = [
    {
      title: 'Anonymat par défaut',
      body:
        "Photos et numéros invisibles tant que les deux parties n'ont pas accepté la mise en relation.",
    },
    {
      title: 'Modération active',
      body:
        "Tout litige est examiné par l'équipe Vibe sous 48h. Trois avertissements entraînent une suspension.",
    },
    {
      title: 'Vos données chez vous',
      body:
        "Hébergement zone CEMAC. Conformité Code numérique camerounais et bonnes pratiques RGPD.",
    },
    {
      title: 'Inscription par WhatsApp',
      body:
        "Code à 6 chiffres reçu sur votre WhatsApp. Aucun mot de passe, aucun email obligatoire.",
    },
  ]
  return (
    <section id="trust" className="mx-auto w-full max-w-6xl px-5 py-28 sm:px-8">
      <div className="mb-14 max-w-2xl">
        <span className="vibe-eyebrow">Confiance</span>
        <h2 className="vibe-display mt-3 text-3xl sm:text-5xl">
          La confiance comme infrastructure.
        </h2>
      </div>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((i) => (
          <div key={i.title} className="vibe-card p-6">
            <h3 className="text-base font-semibold text-[var(--vibe-fg)]">
              {i.title}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-[var(--vibe-fg-muted)]">
              {i.body}
            </p>
          </div>
        ))}
      </div>
    </section>
  )
}

/* ─────────────────────────────────────────────────────────────────
 * Final CTA — single accent stripe + button, no card-in-card
 * ───────────────────────────────────────────────────────────────── */

function FinalCta() {
  return (
    <section className="relative mx-auto w-full max-w-5xl px-5 pb-28 sm:px-8">
      <div className="vibe-card relative overflow-hidden p-12 text-center sm:p-16">
        <div
          className="vibe-glow"
          style={{ '--glow-x': '50%', '--glow-y': '0%' } as React.CSSProperties}
        />
        <div className="relative">
          <span className="vibe-pill vibe-pill-accent">
            <Dot />
            Phase MVP · Inscription gratuite
          </span>
          <h2 className="vibe-display mt-6 text-3xl sm:text-5xl">
            Rejoignez les premiers utilisateurs.
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-base text-[var(--vibe-fg-muted)] sm:text-lg">
            Quelques secondes pour vous inscrire. Vous recevez votre code par
            WhatsApp et discutez avec votre assistant dans la foulée.
          </p>
          <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link to="/sign-up" className="vibe-cta">
              Créer mon compte
              <ArrowRight />
            </Link>
            <Link to="/sign-in" className="vibe-cta-ghost">
              J'ai déjà un compte
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}

/* ── icons ─────────────────────────────────────────────────────── */

function ArrowRight() {
  return (
    <svg
      aria-hidden="true"
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  )
}

function Check() {
  return (
    <svg
      aria-hidden="true"
      className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--vibe-accent)]"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  )
}

function Dot() {
  return (
    <span className="relative inline-flex h-1.5 w-1.5">
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--vibe-accent)] opacity-60" />
      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--vibe-accent)]" />
    </span>
  )
}

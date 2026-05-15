/**
 * Landing page — Vibe
 *
 * Structure mirrors runey.app exactly:
 *  - Hero: headline + sub + CTA + iPhone mockup
 *  - Feature sections: pill badge + h2 + p + feature list (circle-check) + screenshot/mockup
 *  - Testimonials: card grid
 *  - Pricing: 3-column cards
 *  - Final CTA: full-width with Runey-style button
 *  - Dark footer (bg-black)
 *
 * Scroll-reveal: `transition-all duration-700 ease-out` + JS IntersectionObserver
 * Button: exact Runey pattern — bg-gradient-to-b from-[hsl(var(--primary-light))]
 *         to-[hsl(var(--primary))] + inset shadow system
 */

import { createFileRoute, Link } from '@tanstack/react-router'
import { useEffect } from 'react'
import { VibeLayout } from '@/aura/ui/vibe-layout'
import { VibeIphoneMockup } from '@/aura/ui/vibe-iphone-mockup'

export const Route = createFileRoute('/')({ component: LandingPage })

/* ── Scroll-reveal hook ─────────────────────────────────────── */
function useReveal() {
  useEffect(() => {
    const els = document.querySelectorAll<HTMLElement>('[data-reveal]')
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            ;(e.target as HTMLElement).style.opacity = '1'
            ;(e.target as HTMLElement).style.transform = 'translateY(0px)'
            io.unobserve(e.target)
          }
        })
      },
      { threshold: 0.12 },
    )
    els.forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [])
}

/* ── Runey-exact primary button ─────────────────────────────── */
function PrimaryBtn({
  children,
  href,
  className = '',
}: {
  children: React.ReactNode
  href: string
  className?: string
}) {
  return (
    <Link
      to={href as '/sign-up' | '/sign-in'}
      className={
        'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-semibold ' +
        'bg-gradient-to-b from-[hsl(var(--primary-light))] to-[hsl(var(--primary))] ' +
        'text-[hsl(var(--primary-foreground,152_90%_6%))] ' +
        'shadow-[inset_0_1px_0_0_rgba(255,255,255,0.25),inset_0_-1px_0_0_rgba(0,0,0,0.1),0_1px_3px_0_hsl(var(--primary)/0.4),0_4px_12px_-4px_hsl(var(--primary)/0.35)] ' +
        'hover:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.3),inset_0_-1px_0_0_rgba(0,0,0,0.12),0_2px_6px_0_hsl(var(--primary)/0.45),0_8px_20px_-4px_hsl(var(--primary)/0.4)] ' +
        'hover:brightness-[1.06] active:brightness-[0.96] ' +
        'active:shadow-[inset_0_2px_4px_0_rgba(0,0,0,0.2),0_1px_2px_0_hsl(var(--primary)/0.3)] ' +
        'transition-all duration-150 h-11 px-7 ' +
        className
      }
    >
      {children}
    </Link>
  )
}

/* ── Ghost button ───────────────────────────────────────────── */
function GhostBtn({
  children,
  href,
  className = '',
}: {
  children: React.ReactNode
  href: string
  className?: string
}) {
  return (
    <Link
      to={href as '/sign-in' | '/sign-up'}
      className={
        'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full border border-[var(--vibe-line-strong)] ' +
        'bg-transparent text-sm font-semibold text-[var(--vibe-fg)] ' +
        'hover:bg-[var(--vibe-surface-2)] transition-colors h-11 px-7 ' +
        className
      }
    >
      {children}
    </Link>
  )
}

/* ── Pill badge (Runey style) ───────────────────────────────── */
function Pill({ children }: { children: React.ReactNode }) {
  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-[hsl(var(--primary)/0.2)] bg-[hsl(var(--primary)/0.08)] px-4 py-1.5 text-xs font-semibold tracking-wide text-[hsl(var(--primary))]">
      {children}
    </div>
  )
}

/* ── Feature check item ─────────────────────────────────────── */
function FeatureItem({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2 text-[13px] text-foreground/90">
      {/* circle-check icon — exact Runey */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="mt-0.5 shrink-0 text-[hsl(var(--primary))]"
      >
        <circle cx="12" cy="12" r="10" />
        <path d="m9 12 2 2 4-4" />
      </svg>
      {children}
    </li>
  )
}

/* ── Reveal wrapper ─────────────────────────────────────────── */
function Reveal({
  children,
  delay = 0,
  className = '',
}: {
  children: React.ReactNode
  delay?: number
  className?: string
}) {
  return (
    <div
      data-reveal
      className={'transition-all duration-700 ease-out ' + className}
      style={{ opacity: 0, transform: 'translateY(2rem)', transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  )
}

/* ═══════════════════════════════════════════════════════════════
 * Page
 * ═══════════════════════════════════════════════════════════════ */

function LandingPage() {
  useReveal()
  return (
    <VibeLayout>
      <Hero />
      <Testimonials />
      <Features />
      <Pricing />
      <FinalCta />
    </VibeLayout>
  )
}

/* ─────────────────────────────────────────────────────────────────
 * Hero
 * ───────────────────────────────────────────────────────────────── */

function Hero() {
  return (
    <section className="px-4 pb-14 pt-12 md:px-6 md:pb-20 md:pt-20">
      <div className="mx-auto max-w-6xl">
        <div className="grid items-center gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:gap-16">
          {/* Left */}
          <div>
            <Reveal>
              <Pill>Cameroun · Inscription gratuite</Pill>
            </Reveal>

            <Reveal delay={80}>
              <h1 className="mt-5 text-[2rem] font-semibold leading-tight tracking-[-0.025em] text-foreground md:text-[3.25rem]">
                Votre prestataire de confiance,{' '}
                <span className="text-[hsl(var(--primary))]">
                  trouvé sur WhatsApp.
                </span>
              </h1>
            </Reveal>

            <Reveal delay={160}>
              <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground md:text-base">
                Décrivez votre besoin à votre assistant Vibe. Recevez 3 à 5
                profils vérifiés. Discutez de manière anonyme, sans jamais
                partager votre numéro de téléphone.
              </p>
            </Reveal>

            <Reveal delay={240}>
              <div className="mt-8 flex flex-wrap items-center gap-3">
                <PrimaryBtn href="/sign-up">
                  Commencer gratuitement
                  <ArrowRight />
                </PrimaryBtn>
                <GhostBtn href="/sign-in">Se connecter</GhostBtn>
              </div>
              <p className="mt-3 text-[11px] text-muted-foreground">
                Aucun mot de passe · Code par WhatsApp · Gratuit pendant le MVP
              </p>
            </Reveal>
          </div>

          {/* Right — iPhone mockup */}
          <Reveal delay={160} className="flex justify-center lg:justify-end">
            <VibeIphoneMockup />
          </Reveal>
        </div>
      </div>
    </section>
  )
}

/* ─────────────────────────────────────────────────────────────────
 * Testimonials
 * ───────────────────────────────────────────────────────────────── */

function Testimonials() {
  const items = [
    {
      text: "J'ai trouvé un électricien fiable en moins de 5 minutes. L'assistant a compris exactement ce que je cherchais sans que j'aie besoin de remplir un formulaire. Vraiment impressionnant.",
      name: 'Marie K.',
      role: 'Particulière, Yaoundé',
    },
    {
      text: "Depuis que je suis sur Vibe, je reçois des demandes de clients sérieux. Le système de notation me permet de bâtir ma réputation et les clients voient mes avis avant de me contacter.",
      name: 'Jean-Paul N.',
      role: 'Plombier, Douala',
    },
  ]

  return (
    <section className="px-4 py-14 md:px-6 md:py-20">
      <div className="mx-auto max-w-3xl">
        <Reveal className="mb-10 text-center md:mb-12">
          <Pill>Témoignages</Pill>
          <h2 className="mt-4 text-xl font-semibold leading-tight tracking-[-0.025em] text-foreground md:text-[2rem]">
            Aimé par les clients et les prestataires
          </h2>
          <p className="mt-3 mx-auto max-w-xl text-sm leading-relaxed text-muted-foreground">
            Des mots vrais de personnes qui utilisent Vibe au quotidien.
          </p>
        </Reveal>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {items.map((t, i) => (
            <Reveal key={i} delay={i * 80}>
              <div className="flex flex-col gap-6 rounded-2xl border border-border/60 bg-card p-6 shadow-sm md:rounded-3xl md:p-8">
                <p className="text-[15px] leading-relaxed text-foreground md:text-base">
                  {t.text}
                </p>
                <div className="mt-auto flex items-center gap-3">
                  <div
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-sm font-semibold text-white"
                    style={{
                      background:
                        'radial-gradient(circle at 30% 25%, #2ec788, #18a065)',
                    }}
                  >
                    {t.name[0]}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-foreground">
                      {t.name}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {t.role}
                    </div>
                  </div>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ─────────────────────────────────────────────────────────────────
 * Features — Runey structure: pill + h3 + p + feature list + mockup
 * ───────────────────────────────────────────────────────────────── */

function Features() {
  return (
    <section id="features" className="px-4 py-14 md:px-6 md:py-20">
      <div className="mx-auto mb-10 max-w-3xl text-center md:mb-12">
        <Reveal>
          <Pill>Fonctionnalités</Pill>
          <h2 className="mt-4 text-xl font-semibold leading-tight tracking-[-0.025em] text-foreground md:text-[2rem]">
            Tout ce dont vous avez besoin pour trouver ou proposer un service
          </h2>
          <p className="mt-3 mx-auto max-w-xl text-sm leading-relaxed text-muted-foreground">
            Du matching IA à la conversation anonyme — tous les outils en un seul endroit.
          </p>
        </Reveal>
      </div>

      <div className="mx-auto max-w-[1200px] space-y-5">
        <FeatureBlock
          id="matching"
          pill="Matching IA"
          title="Trouvez le bon prestataire en moins de 3 minutes"
          description="Décrivez votre besoin en langage naturel sur WhatsApp. L'assistant Vibe analyse votre demande, interroge la base de prestataires et vous propose 3 à 5 profils pertinents avec leurs notes et spécialités."
          features={[
            'Compréhension du langage naturel (FR + EN)',
            'Matching par compétences, localisation et réputation',
            'Mélange de profils très compatibles et complémentaires',
            'Résultats en moins de 10 secondes',
            'Historique de vos recherches sur le dashboard',
            'Suggestions affinées à chaque conversation',
          ]}
        />

        <FeatureBlock
          id="anonymat"
          pill="Anonymat & Sécurité"
          title="Discutez en toute sécurité, sans jamais partager votre numéro"
          description="Le double opt-in garantit que les deux parties acceptent la mise en relation avant tout échange. Photos et numéros restent masqués jusqu'à votre accord explicite. Toutes les conversations sont conservées pour les litiges."
          features={[
            'Double opt-in obligatoire avant ouverture du chat',
            'Alias affiché à la place du vrai nom',
            'Photos révélées uniquement après acceptation mutuelle',
            'Numéros de téléphone jamais échangés',
            'Historique complet conservé pour les litiges',
            'Signalement en un clic depuis le chat',
          ]}
        />

        <FeatureBlock
          id="prestataires"
          pill="Pour les prestataires"
          title="Soyez visible auprès des bons clients"
          description="Publiez vos services, définissez vos zones d'intervention et vos tarifs. Votre profil est automatiquement indexé dans le moteur de matching. Chaque mission notée renforce votre réputation sur la plateforme."
          features={[
            'Publication de services avec tarifs et disponibilité',
            'Zones d\'intervention personnalisables',
            'Indexation automatique dans le moteur de matching',
            'Système de notation après chaque mission',
            'Badge Vérifié pour les prestataires identifiés',
            'Statistiques de visibilité sur le dashboard',
          ]}
        />

        <FeatureBlock
          id="moderation"
          pill="Modération"
          title="Une plateforme de confiance, modérée activement"
          description="Chaque litige est examiné par l'équipe Vibe. Trois avertissements entraînent une suspension automatique. Les admins peuvent lire les conversations signalées et trancher en toute transparence."
          features={[
            'Signalement depuis le chat en un clic',
            'Snapshot de la conversation au moment du signalement',
            'Examen par l\'équipe Vibe sous 48h',
            'Système d\'avertissements progressifs',
            'Suspension automatique après 3 avertissements',
            'Levée de suspension possible après résolution',
          ]}
        />
      </div>
    </section>
  )
}

function FeatureBlock({
  id,
  pill,
  title,
  description,
  features,
}: {
  id: string
  pill: string
  title: string
  description: string
  features: string[]
}) {
  return (
    <Reveal>
      <div
        id={id}
        className="overflow-hidden rounded-2xl border border-border/40 bg-card"
      >
        <div className="p-5 pb-4 md:p-7 md:pb-5">
          <Pill>{pill}</Pill>
          <h3 className="mb-2 mt-3 text-2xl font-semibold leading-tight tracking-[-0.02em] text-foreground">
            {title}
          </h3>
          <p className="mb-4 text-[13px] leading-relaxed text-muted-foreground">
            {description}
          </p>
          <ul className="grid grid-cols-1 gap-x-4 gap-y-2 md:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <FeatureItem key={f}>{f}</FeatureItem>
            ))}
          </ul>
        </div>
        {/* Mockup placeholder — will be replaced with real screenshots */}
        <div className="px-3 pb-3 pt-2 md:px-5 md:pb-5">
          <div className="overflow-hidden rounded-xl">
            <div
              className="flex w-full items-center justify-center rounded-xl border border-border/30 bg-[var(--vibe-bg-2)]"
              style={{ aspectRatio: '16/7' }}
            >
              <span className="text-xs text-muted-foreground">
                Aperçu disponible prochainement
              </span>
            </div>
          </div>
        </div>
      </div>
    </Reveal>
  )
}

/* ─────────────────────────────────────────────────────────────────
 * Pricing — 3 cards, Runey structure
 * ───────────────────────────────────────────────────────────────── */

function Pricing() {
  const plans = [
    {
      name: 'Gratuit',
      sub: 'Pour découvrir',
      price: '0',
      period: '/mois',
      note: 'Phase MVP — aucune carte requise',
      users: 'Accès complet',
      features: [
        'Matching IA illimité',
        'Chat anonyme',
        'Profil prestataire',
        'Notation après mission',
        'Notifications WhatsApp',
        'Dashboard web',
      ],
      cta: 'Commencer gratuitement',
      href: '/sign-up',
      highlight: false,
    },
    {
      name: 'Badge Vérifié',
      sub: 'Pour les prestataires sérieux',
      price: '10 000',
      period: ' FCFA/an',
      note: 'Bientôt disponible',
      users: 'Prestataires uniquement',
      features: [
        'Tout le plan Gratuit',
        'Vérification d\'identité (selfie + CNI)',
        'Priorité dans les résultats de matching',
        'Badge visible sur le profil',
        'Garantie plateforme en cas de litige',
        'Historique des missions visible',
      ],
      cta: 'Bientôt disponible',
      href: '/sign-up',
      highlight: true,
    },
    {
      name: 'Pro',
      sub: 'Pour les prestataires actifs',
      price: '3 000',
      period: ' FCFA/mois',
      note: 'Bientôt disponible',
      users: 'Prestataires uniquement',
      features: [
        'Tout le plan Badge Vérifié',
        'Matchings illimités par jour',
        'Boost ponctuel (top 3 pendant 7 jours)',
        'Statistiques avancées',
        'Support prioritaire',
      ],
      cta: 'Bientôt disponible',
      href: '/sign-up',
      highlight: false,
    },
  ]

  return (
    <section id="pricing" className="px-4 py-14 md:px-6 md:py-20">
      <div className="mx-auto max-w-[1100px]">
        <Reveal>
          <div className="mb-8 text-center">
            <Pill>Tarifs</Pill>
            <h2 className="mt-4 text-xl font-semibold leading-tight tracking-[-0.025em] text-foreground md:text-[2rem]">
              Simple et transparent
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Tout ce dont vous avez besoin pour trouver ou proposer un service. Sans frais cachés.
            </p>
          </div>
        </Reveal>

        <div className="grid grid-cols-1 items-stretch gap-5 md:grid-cols-3">
          {plans.map((p, i) => (
            <Reveal key={p.name} delay={i * 80}>
              <div
                className={
                  'relative flex flex-col rounded-2xl border p-6 text-left md:p-7 ' +
                  (p.highlight
                    ? 'border-[hsl(var(--primary)/0.4)] bg-[hsl(var(--primary)/0.06)]'
                    : 'border-border/60 bg-card')
                }
              >
                {p.highlight && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                    <span className="rounded-full bg-[hsl(var(--primary))] px-3 py-0.5 text-[10px] font-semibold text-[hsl(var(--primary-foreground,152_90%_6%))]">
                      Recommandé
                    </span>
                  </div>
                )}
                <div className="mb-3">
                  <div className="text-base font-semibold text-foreground">
                    {p.name}
                  </div>
                  <div className="text-xs text-muted-foreground">{p.sub}</div>
                </div>
                <div className="mb-1 flex items-baseline gap-1">
                  <span className="text-4xl font-semibold tracking-tight text-foreground">
                    {p.price}
                  </span>
                  <span className="text-sm text-muted-foreground">
                    {p.period}
                  </span>
                </div>
                <p className="mb-3 text-xs text-muted-foreground">{p.note}</p>
                <div className="mb-5 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <UsersIcon />
                  {p.users}
                </div>
                <ul className="mb-6 flex-1 space-y-2.5">
                  {p.features.map((f) => (
                    <li
                      key={f}
                      className="flex items-start gap-2 text-[13px] text-foreground/90"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="mt-0.5 shrink-0 text-[hsl(var(--primary))]"
                      >
                        <path d="M20 6 9 17l-5-5" />
                      </svg>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
                <PrimaryBtn href={p.href as '/sign-up'} className="w-full justify-center">
                  {p.cta}
                  <ArrowRight />
                </PrimaryBtn>
              </div>
            </Reveal>
          ))}
        </div>

        <p className="mt-5 text-center text-[11px] text-muted-foreground">
          Aucune carte requise. Les plans payants seront activés après le MVP.
          Paiement via MTN MoMo et Orange Money.
        </p>
      </div>
    </section>
  )
}

/* ─────────────────────────────────────────────────────────────────
 * Final CTA — Runey style: full-width, dark bg, white CTA
 * ───────────────────────────────────────────────────────────────── */

function FinalCta() {
  return (
    <section className="relative overflow-hidden">
      {/* Dark bg with subtle accent glow */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(900px 500px at 50% 0%, rgba(31,181,115,0.12), transparent 60%), #0a0d0c',
        }}
      />
      <div className="relative px-6 pb-12 pt-16 md:pb-20 md:pt-28">
        <div className="mx-auto max-w-[1200px] text-left">
          <Reveal>
            <h2 className="mb-5 text-3xl font-semibold leading-[1.05] tracking-[-0.03em] text-white md:text-5xl">
              Rejoignez les premiers utilisateurs Vibe
            </h2>
            <p className="mb-8 max-w-[600px] text-sm leading-relaxed text-white/70 md:text-base">
              Inscrivez-vous avec votre numéro WhatsApp. Recevez votre code.
              Discutez avec votre assistant IA dans la foulée. Gratuit pendant
              toute la phase MVP.
            </p>
            <div className="mb-10 flex flex-wrap items-center gap-4 md:mb-14">
              <Link
                to="/sign-up"
                className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full bg-white px-8 text-sm font-semibold text-black hover:bg-white/90 h-11 border-0 transition-colors"
              >
                Créer mon compte
                <ArrowRight />
              </Link>
              <Link
                to="/sign-in"
                className="inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full border border-white/30 bg-transparent px-8 text-sm font-semibold text-white hover:bg-white/10 hover:text-white h-11 transition-colors"
              >
                Se connecter
              </Link>
              <p className="text-[11px] text-white/60">
                Gratuit · Aucune carte requise · Code par WhatsApp
              </p>
            </div>
          </Reveal>

          {/* iPhone mockup at the bottom like Runey's invoice preview */}
          <Reveal delay={150} className="pb-8 md:pb-12">
            <div className="flex justify-center">
              <VibeIphoneMockup />
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  )
}

/* ─────────────────────────────────────────────────────────────────
 * Icons
 * ───────────────────────────────────────────────────────────────── */

function ArrowRight() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
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
  )
}

function UsersIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  )
}

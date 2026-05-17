import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'

export const Route = createFileRoute('/')({ component: LandingPage })

function LandingPage() {
  return (
    <div className="relative min-h-screen overflow-x-hidden">
      {/* Background */}
      <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
        <div className="animate-drift-one absolute -top-[12%] -left-[12%] h-[52vw] w-[52vw] rounded-full bg-blue-200/35 blur-[7.5rem]" />
        <div className="animate-drift-two absolute -bottom-[18%] -right-[10%] h-[62vw] w-[62vw] rounded-full bg-sky-200/20 blur-[8.75rem]" />
        <div className="absolute top-[36%] left-[36%] h-[30vw] w-[30vw] rounded-full bg-white/55 blur-[5rem]" />
        <div className="absolute inset-0 opacity-[0.18]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(15,23,42,0.09) 1px, transparent 0)', backgroundSize: '2rem 2rem' }} />
      </div>

      <SiteNav />

      <main className="relative z-10">
        <HeroSection />
        <MockupSection />
        <HowSection />
        <WhoSection />
        <FinalCTA />
      </main>

      <SiteFooter />
    </div>
  )
}

/* ── Nav ──────────────────────────────────────────── */

function SiteNav() {
  return (
    <header className="fixed top-0 left-0 right-0 z-50">
      <nav className="mx-auto max-w-7xl px-4 pt-4 sm:px-6 sm:pt-5">
        <div className="relative overflow-hidden rounded-full bg-white/84 backdrop-blur-2xl border border-white/90 shadow-nav px-4 py-2.5">
          <div className="absolute inset-0 rounded-full bg-white/36 pointer-events-none" />
          <div className="relative z-10 flex items-center justify-between">
            <Link to="/" className="inline-block">
              <span className="text-2xl sm:text-3xl font-black tracking-[-0.06em] text-slate-950 leading-none">Orya</span>
            </Link>
            <div className="flex items-center gap-2">
              <Link to="/sign-in" className="hidden sm:inline-flex items-center justify-center rounded-full px-4 py-2 text-xs text-slate-700 bg-white/78 border border-slate-200 shadow-btn-ghost hover:bg-white transition-all">
                Login
              </Link>
              <Link to="/sign-up" className="inline-flex items-center justify-center rounded-full px-4 py-2 text-xs text-white bg-gradient-to-b from-blue-500 to-blue-600 border border-blue-700 shadow-btn-primary hover:-translate-y-0.5 transition-all">
                Sign up
              </Link>
            </div>
          </div>
        </div>
      </nav>
    </header>
  )
}

/* ── Hero ─────────────────────────────────────────── */

function HeroSection() {
  return (
    <section className="mx-auto max-w-5xl px-4 pt-32 sm:pt-44 pb-8 text-center">
      {/* Rhetorical question headline */}
      <h1 className="text-[1.6rem] sm:text-[2.2rem] md:text-[3rem] font-extralight tracking-[-0.04em] leading-[1.1] text-slate-800">
        Vous connaissez vraiment les gens{' '}
        <span className="bg-gradient-to-b from-blue-500 to-blue-600 px-2 py-0.5 text-white font-medium shadow-btn-primary">autour de vous</span>
        {' '}?
      </h1>

      <p className="mt-5 sm:mt-6 text-sm sm:text-base leading-8 text-slate-500 max-w-lg mx-auto">
        Orya connecte les <AudienceWords /> entre eux.<br className="hidden sm:block" />
        Memes interets, meme quartier, memes ambitions. Sur WhatsApp.
      </p>

      <div className="mt-8">
        <Link to="/sign-up" className="inline-flex items-center justify-center gap-2 rounded-full px-6 py-3.5 bg-gradient-to-b from-blue-500 to-blue-600 border border-blue-700 text-white text-sm shadow-btn-primary hover:-translate-y-0.5 transition-all">
          Rejoindre Orya
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </section>
  )
}

/* ── Mockup — macOS window style ──────────────────── */

function MockupSection() {
  return (
    <section className="mx-auto max-w-xs sm:max-w-sm px-4 py-8">
      {/* macOS window shell — overflow hidden crops elements */}
      <div className="rounded-sm bg-white/80 backdrop-blur border border-white shadow-[0_30px_80px_-30px_rgba(15,23,42,0.3),inset_0_1px_0_white] overflow-hidden">
        {/* Title bar */}
        <div className="flex items-center gap-1.5 px-4 py-2.5 border-b border-slate-200/60 bg-gradient-to-b from-slate-50 to-white">
          <span className="h-[10px] w-[10px] rounded-full bg-[#ff5f57] border border-[#e0443e]" />
          <span className="h-[10px] w-[10px] rounded-full bg-[#febc2e] border border-[#d4a123]" />
          <span className="h-[10px] w-[10px] rounded-full bg-[#28c840] border border-[#1fa834]" />
          <span className="ml-auto font-mono text-[9px] text-slate-400 tracking-tight">Messages</span>
        </div>

        {/* Conversation list — last item cropped by overflow */}
        <div className="p-3 space-y-1.5 h-[200px]">
          <ConvRow
            color="from-blue-500 to-blue-600"
            letter="A"
            name="Orya"
            msg="J'ai 2 personnes pour toi dans le groupe photo Douala"
            time="14:02"
            unread
          />
          <ConvRow
            color="from-emerald-500 to-emerald-600"
            letter="D"
            name="Devs Douala"
            msg="Kevin: Qui vient au meetup samedi ?"
            time="13:45"
          />
          <ConvRow
            color="from-violet-500 to-violet-600"
            letter="M"
            name="Marie K."
            msg="Merci pour le contact, il est vraiment top"
            time="12:30"
          />
          {/* This one gets cropped */}
          <ConvRow
            color="from-amber-500 to-amber-600"
            letter="S"
            name="Startup Yaounde"
            msg="Nouveau membre: Paul vient de rejoindre"
            time="11:15"
          />
        </div>
      </div>
    </section>
  )
}

function ConvRow({ color, letter, name, msg, time, unread }: {
  color: string; letter: string; name: string; msg: string; time: string; unread?: boolean
}) {
  return (
    <div className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 transition-colors ${unread ? 'bg-blue-50/60 border border-blue-100/60' : 'hover:bg-slate-50'}`}>
      <div className={`h-9 w-9 shrink-0 rounded-full bg-gradient-to-br ${color} flex items-center justify-center text-[11px] font-semibold text-white shadow-[0_2px_6px_rgba(0,0,0,0.15)]`}>
        {letter}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <p className={`text-[12px] truncate ${unread ? 'font-semibold text-slate-900' : 'font-medium text-slate-700'}`}>{name}</p>
          <span className="text-[9px] text-slate-400 shrink-0">{time}</span>
        </div>
        <p className={`text-[11px] truncate ${unread ? 'text-slate-600' : 'text-slate-400'} font-light`}>{msg}</p>
      </div>
      {unread && <span className="h-2 w-2 shrink-0 rounded-full bg-blue-500" />}
    </div>
  )
}

/* ── How it works ─────────────────────────────────── */

function HowSection() {
  return (
    <section className="mx-auto max-w-4xl px-4 py-14 sm:py-20">
      <h2 className="text-xl sm:text-2xl md:text-3xl font-normal tracking-tight text-slate-950 text-center leading-tight">
        Pas d'app.{' '}
        <span className="bg-slate-900 px-2 py-0.5 text-white font-medium">Juste WhatsApp.</span>
      </h2>

      <div className="mt-8 sm:mt-10 grid gap-3 sm:grid-cols-3">
        {[
          { step: '1', title: 'Parlez a Orya', desc: 'Dites-lui ce qui vous interesse, ou vous etes, ce que vous cherchez.' },
          { step: '2', title: 'Elle vous connecte', desc: 'Orya vous propose des personnes et des groupes qui correspondent.' },
          { step: '3', title: 'Vous echangez', desc: 'Les connexions se font naturellement. Pas de feed, pas de scroll.' },
        ].map(({ step, title, desc }) => (
          <div key={step} className="rounded-2xl bg-white/62 border border-white p-8 shadow-card">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-b from-blue-500 to-blue-600 text-[10px] font-bold text-white shadow-btn-primary">
              {step}
            </span>
            <h3 className="mt-4 text-sm font-medium tracking-tight text-slate-950">{title}</h3>
            <p className="mt-1.5 text-xs leading-5 text-slate-500 font-light">{desc}</p>
          </div>
        ))}
      </div>
    </section>
  )
}

/* ── Who is it for ────────────────────────────────── */

function WhoSection() {
  return (
    <section className="mx-auto max-w-3xl px-4 py-14">
      <div className="rounded-2xl sm:rounded-[2rem] bg-gradient-to-b from-[#172033] to-[#101827] text-white border border-white/10 shadow-[0_30px_70px_-35px_rgba(15,23,42,0.7),inset_0_1px_0_rgba(255,255,255,0.12)] p-6 sm:p-10 relative overflow-hidden">
        <div className="absolute top-[-30%] right-[-15%] h-[24rem] w-[24rem] rounded-full bg-blue-400/12 blur-[5rem]" />
        <div className="absolute inset-0 opacity-[0.06]" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.08) 1px, transparent 1px)', backgroundSize: '32px 32px' }} />

        <div className="relative">
          <h2 className="text-lg sm:text-xl md:text-2xl font-light tracking-tight leading-snug">
            Pour ceux qui veulent des connexions{' '}
            <span className="bg-white/10 border border-white/20 px-2 py-0.5 font-medium">qui comptent vraiment.</span>
          </h2>
          <div className="mt-6 grid gap-2 sm:grid-cols-2">
            {[
              'Vous venez d\'arriver quelque part et vous ne connaissez personne',
              'Vous cherchez des personnes qui partagent vos centres d\'interet',
              'Vous voulez un cercle authentique, sans le theatre des reseaux',
              'Vous voulez des echanges reels, pas des likes',
            ].map((t) => (
              <div key={t} className="flex items-center gap-2.5 rounded-xl bg-white/[0.05] border border-white/10 px-3 py-2.5">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-blue-400" />
                <p className="text-xs sm:text-sm text-slate-300 font-light leading-snug">{t}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

/* ── Final CTA ────────────────────────────────────── */

function FinalCTA() {
  return (
    <section className="mx-auto max-w-2xl px-4 py-14 text-center">
      <h2 className="text-xl sm:text-2xl font-normal tracking-tight text-slate-950">
        Votre prochaine rencontre est peut-etre<br />
        <span className="bg-gradient-to-b from-blue-500 to-blue-600 px-2 py-0.5 text-white font-medium shadow-btn-primary">a 2 rues</span>{' '}
        de chez vous.
      </h2>
      <p className="mt-3 text-xs sm:text-sm text-slate-400 font-light">
        Gratuit. Pas d'application a telecharger. Juste WhatsApp.
      </p>
      <div className="mt-6">
        <Link to="/sign-up" className="inline-flex items-center justify-center gap-2 rounded-full px-6 py-3.5 bg-gradient-to-b from-blue-500 to-blue-600 border border-blue-700 text-white text-sm shadow-btn-primary hover:-translate-y-0.5 transition-all">
          Commencer maintenant
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </section>
  )
}

/* ── Audience words ───────────────────────────────── */

const WORDS = [
  { text: 'etudiants', bg: 'bg-blue-600 uppercase !font-extrabold' },
  { text: 'professionnels', bg: 'bg-slate-900 uppercase !font-extrabold' },
  { text: 'managers', bg: 'bg-indigo-600 uppercase !font-extrabold' },
  { text: 'entrepreneurs', bg: 'bg-emerald-600 uppercase !font-extrabold' },
  { text: 'parents', bg: 'bg-violet-600 uppercase !font-extrabold' },
  { text: 'nouveaux arrivants', bg: 'bg-amber-600 uppercase !font-extrabold' },
]

function AudienceWords() {
  return (
    <span className="inline-flex flex-wrap items-center justify-center gap-1">
      {WORDS.map((w) => (
        <span key={w.text} className={`${w.bg} px-1.5 py-0.5 text-white font-medium`}>{w.text}</span>
      ))}
    </span>
  )
}

/* ── Footer ───────────────────────────────────────── */

function SiteFooter() {
  return (
    <footer className="relative z-10 border-t border-white/80 bg-white/50 backdrop-blur-xl">
      <div className="mx-auto max-w-7xl px-4 py-6 flex flex-col sm:flex-row items-center justify-between gap-3">
        <p className="text-[10px] text-slate-400 font-light">{new Date().getFullYear()} Orya</p>
        <div className="flex items-center gap-3 text-[10px] text-slate-400 font-light">
          <a href="#" className="hover:text-blue-600 transition-colors">Conditions</a>
          <span className="h-0.5 w-0.5 rounded-full bg-slate-300" />
          <a href="#" className="hover:text-blue-600 transition-colors">Confidentialite</a>
          <span className="h-0.5 w-0.5 rounded-full bg-slate-300" />
          <a href="#" className="hover:text-blue-600 transition-colors">Contact</a>
        </div>
      </div>
    </footer>
  )
}

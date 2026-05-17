import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/about')({ component: AboutPage })

function AboutPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-12">
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">A propos</p>
      <h1 className="mt-2 text-2xl font-black tracking-tight">
        Orya — Mise en relation de confiance.
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        Plateforme de mise en relation pour l'economie informelle camerounaise et francophone d'Afrique.
        Construite sur TanStack Start, Hono, Prisma et shadcn UI.
      </p>
    </main>
  )
}

import { createFileRoute } from '@tanstack/react-router'
import { useAuraQuery } from '@/aura/client'
import { api } from '@/aura/_generated/api'

export const Route = createFileRoute('/p/$alias')({ component: PublicProfilePage })

function PublicProfilePage() {
  const { alias } = Route.useParams()
  const profile = useAuraQuery(api.profiles['get-by-alias'], { input: { alias } })
  if (profile.isLoading) return <p className="p-8">Chargement...</p>
  if (!profile.data) return <p className="p-8">Profil introuvable.</p>
  const p = profile.data as any
  return (
    <div className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-bold">{p.alias}</h1>
      {p.isVerified && <span className="ml-2 text-xs text-green-400">✓ Vérifié</span>}
      <p className="mt-2 text-sm text-white/70">{p.bio}</p>
      <p className="mt-1 text-xs text-white/50">{p.locationLabel} · {p.language}</p>
      {p.ratingAvg && <p className="mt-1 text-sm">⭐ {p.ratingAvg.toFixed(1)} ({p.ratingCount} avis)</p>}
      <h2 className="mt-6 text-lg font-semibold">Services</h2>
      {p.services?.map((s: any) => (
        <div key={s.id} className="mt-2 rounded-lg border border-white/10 p-3">
          <span className="font-medium">{s.title}</span> · {s.priceXaf} FCFA
        </div>
      ))}
    </div>
  )
}

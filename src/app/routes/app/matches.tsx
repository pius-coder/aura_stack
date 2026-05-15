import { createFileRoute } from '@tanstack/react-router'
import { useAuraQuery } from '@/aura/client'
import { api } from '@/aura/_generated/api'

export const Route = createFileRoute('/app/matches')({ component: MatchesPage })

function MatchesPage() {
  const incoming = useAuraQuery(api.matches['list-incoming'])
  const outgoing = useAuraQuery(api.matches['list-outgoing'])
  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold">Mes matchs</h1>
      <section className="mt-6">
        <h2 className="text-lg font-semibold">Reçus</h2>
        {incoming.data?.length === 0 && <p className="text-sm text-white/50 mt-2">Aucune demande reçue.</p>}
        {incoming.data?.map((m: any) => (
          <div key={m.id} className="mt-2 rounded-lg border border-white/10 p-3 text-sm">
            <span className="font-medium">{m.requester?.alias}</span> — {m.status}
          </div>
        ))}
      </section>
      <section className="mt-8">
        <h2 className="text-lg font-semibold">Envoyés</h2>
        {outgoing.data?.length === 0 && <p className="text-sm text-white/50 mt-2">Aucune demande envoyée.</p>}
        {outgoing.data?.map((m: any) => (
          <div key={m.id} className="mt-2 rounded-lg border border-white/10 p-3 text-sm">
            <span className="font-medium">{m.target?.alias}</span> — {m.status}
          </div>
        ))}
      </section>
    </div>
  )
}

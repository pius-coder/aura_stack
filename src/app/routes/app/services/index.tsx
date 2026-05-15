import { createFileRoute } from '@tanstack/react-router'
import { useAuraQuery } from '@/aura/client'
import { api } from '@/aura/_generated/api'

export const Route = createFileRoute('/app/services/')({ component: ServicesPage })

function ServicesPage() {
  const services = useAuraQuery(api.services['list-mine'])
  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold">Mes services</h1>
      <a href="/app/services/new" className="mt-4 inline-block rounded-lg bg-white/10 px-4 py-2 text-sm hover:bg-white/20">+ Nouveau service</a>
      {services.data?.items?.length === 0 && <p className="mt-4 text-sm text-white/50">Aucun service publié.</p>}
      {services.data?.items?.map((s: any) => (
        <div key={s.id} className="mt-3 rounded-lg border border-white/10 p-4">
          <h3 className="font-semibold">{s.title}</h3>
          <p className="text-xs text-white/60">{s.zone} · {s.priceXaf} FCFA · {s.isActive ? '✅ Actif' : '⏸ Inactif'}</p>
        </div>
      ))}
    </div>
  )
}

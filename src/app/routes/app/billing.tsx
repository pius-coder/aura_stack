import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/app/billing')({ component: BillingPage })

function BillingPage() {
  const plans = [
    { kind: 'BADGE', name: 'Badge Vérifié', price: '10 000 FCFA/an', desc: 'Priorité dans les résultats + badge de confiance.' },
    { kind: 'BOOST', name: 'Boost', price: '1 000 FCFA / 7 jours', desc: 'Top 3 des résultats pendant 7 jours.' },
    { kind: 'PRO', name: 'Abonnement Pro', price: '3 000 FCFA/mois', desc: 'Match requests illimitées.' },
  ]

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold">Monétisation</h1>
      <p className="mt-2 text-sm text-white/60">Les paiements seront activés prochainement.</p>
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {plans.map((p) => (
          <div key={p.kind} className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
            <h3 className="font-semibold">{p.name}</h3>
            <p className="mt-1 text-lg font-bold text-white">{p.price}</p>
            <p className="mt-2 text-xs text-white/60">{p.desc}</p>
            <button disabled className="mt-4 w-full rounded-lg bg-white/10 px-3 py-2 text-sm opacity-50 cursor-not-allowed">
              Bientôt disponible
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

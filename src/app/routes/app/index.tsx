import { createFileRoute } from '@tanstack/react-router'
import { useAuraQuery } from '@/aura/client'
import { api } from '@/aura/_generated/api'

export const Route = createFileRoute('/app/')({ component: DashboardHome })

function DashboardHome() {
  const { data } = useAuraQuery(api.auth['vibe-me'])
  const profile = data?.profile

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold">
        Bienvenue{profile?.displayName ? `, ${profile.displayName}` : ''} 👋
      </h1>
      <p className="mt-1 text-sm text-white/60">Votre tableau de bord Vibe.</p>

      <div className="mt-8 grid gap-4 sm:grid-cols-3">
        <StatCard label="Statut" value={profile?.status === 'ACTIVE' ? '✅ Actif' : '⏸ Suspendu'} />
        <StatCard label="Rôle" value={profile?.isProvider ? 'Prestataire' : 'Membre'} />
        <StatCard label="Vérifié" value={profile?.isVerified ? '✓ Oui' : 'Non'} />
      </div>

      <div className="mt-8 space-y-2">
        <h2 className="text-lg font-semibold">Actions rapides</h2>
        <div className="flex flex-wrap gap-2">
          {!profile?.isProvider && (
            <a href="/app/services" className="rounded-lg border border-white/10 px-4 py-2 text-sm hover:bg-white/5">
              Publier un service
            </a>
          )}
          <a href="/app/matches" className="rounded-lg border border-white/10 px-4 py-2 text-sm hover:bg-white/5">
            Voir mes matchs
          </a>
          <a href="/app/chat" className="rounded-lg border border-white/10 px-4 py-2 text-sm hover:bg-white/5">
            Mes conversations
          </a>
        </div>
      </div>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
      <p className="text-xs text-white/50">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  )
}

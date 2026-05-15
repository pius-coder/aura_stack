import { createFileRoute } from '@tanstack/react-router'
import { useAuraQuery } from '@/aura/client'
import { api } from '@/aura/_generated/api'

export const Route = createFileRoute('/app/')({ component: DashboardHome })

function DashboardHome() {
  const { data } = useAuraQuery(api.auth['vibe-me'])
  const alias = data?.profile?.alias ?? '...'

  return (
    <div>
      <h1 className="text-2xl font-bold">Bienvenue, {alias} 👋</h1>
      <p className="mt-2 text-gray-600">Votre tableau de bord Vibe.</p>
    </div>
  )
}

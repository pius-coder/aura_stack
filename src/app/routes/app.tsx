import { createFileRoute, Link, Outlet, useNavigate } from '@tanstack/react-router'
import { useAuraQuery, useAuraMutation } from '@/aura/client'
import { api } from '@/aura/_generated/api'

export const Route = createFileRoute('/app')({ component: AppLayout })

function AppLayout() {
  const navigate = useNavigate()
  const { data, isLoading } = useAuraQuery(api.auth['vibe-me'])
  const logout = useAuraMutation(api.auth['vibe-logout'], {
    onSuccess: () => navigate({ to: '/sign-in' }),
  })

  // Redirect if not authenticated
  if (!isLoading && !data?.user) {
    navigate({ to: '/sign-in' })
    return null
  }

  if (isLoading) return <div className="flex min-h-screen items-center justify-center"><p className="text-white/50">Chargement…</p></div>

  const profile = data?.profile
  const isProvider = profile?.isProvider

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-56 flex-col border-r border-white/10 bg-zinc-900 p-4">
        <div className="mb-6">
          <p className="text-sm font-bold text-white">Vibe</p>
          <p className="mt-1 text-xs text-white/50">{profile?.alias}</p>
        </div>
        <nav className="flex flex-1 flex-col gap-1 text-sm">
          <NavLink to="/app" label="Accueil" />
          {isProvider && <NavLink to="/app/services" label="Mes services" />}
          <NavLink to="/app/matches" label="Mes matchs" />
          <NavLink to="/app/chat" label="Conversations" />
          <NavLink to="/app/billing" label="Abonnement" />
          <NavLink to="/app/settings" label="Paramètres" />
        </nav>
        <button onClick={() => logout.mutate({})} className="mt-auto rounded-lg px-3 py-2 text-left text-xs text-white/50 hover:bg-white/5 hover:text-white">
          Déconnexion
        </button>
      </aside>
      <main className="flex-1 overflow-y-auto p-6">
        <Outlet />
      </main>
    </div>
  )
}

function NavLink({ to, label }: { to: string; label: string }) {
  return (
    <Link to={to} className="rounded-lg px-3 py-2 text-white/70 hover:bg-white/5 hover:text-white [&.active]:bg-white/10 [&.active]:text-white">
      {label}
    </Link>
  )
}

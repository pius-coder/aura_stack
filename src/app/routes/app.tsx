import { createFileRoute, Outlet, useNavigate } from '@tanstack/react-router'
import { useAuraQuery } from '@/aura/client'
import { api } from '@/aura/_generated/api'

export const Route = createFileRoute('/app')({ component: AppLayout })

function AppLayout() {
  const navigate = useNavigate()
  const { data, isLoading } = useAuraQuery(api.auth['vibe-me'])

  if (!isLoading && !data?.user) {
    navigate({ to: '/sign-in' })
    return null
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <p className="text-xs text-slate-400">Chargement...</p>
      </div>
    )
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col bg-white md:border-x md:border-slate-100">
      <Outlet />
    </div>
  )
}

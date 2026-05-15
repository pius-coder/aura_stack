import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/admin/')({ component: AdminDashboard })

function AdminDashboard() {
  return (
    <div>
      <h1 className="text-2xl font-bold">Admin Dashboard</h1>
      <p className="mt-2 text-white/60">Bienvenue sur la console d'administration Vibe.</p>
    </div>
  )
}

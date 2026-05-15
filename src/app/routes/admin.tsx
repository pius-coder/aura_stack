import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/admin')({
  beforeLoad: ({ context }) => {
    const c = context as any;
    if (!c?.user?.isAdmin) throw redirect({ to: '/app' });
  },
  component: AdminLayout,
})

function AdminLayout() {
  return (
    <div className="flex min-h-screen">
      <aside className="w-56 border-r border-white/10 bg-zinc-950 p-4 text-sm text-white/70">
        <p className="mb-4 font-semibold text-white">Admin Vibe</p>
        <nav className="space-y-2">
          <a href="/admin" className="block hover:text-white">Dashboard</a>
          <a href="/admin/users" className="block hover:text-white">Utilisateurs</a>
          <a href="/admin/disputes" className="block hover:text-white">Litiges</a>
          <a href="/admin/match-sessions" className="block hover:text-white">Match Sessions</a>
        </nav>
      </aside>
      <main className="flex-1 p-6"><Outlet /></main>
    </div>
  )
}

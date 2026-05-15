import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/admin/users')({ component: AdminUsersPage })

function AdminUsersPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold">Utilisateurs</h1>
      <p className="mt-2 text-sm text-white/60">Liste des utilisateurs avec actions suspend/reactivate. Connecté à admin.users.suspend et admin.users.reactivate.</p>
    </div>
  )
}

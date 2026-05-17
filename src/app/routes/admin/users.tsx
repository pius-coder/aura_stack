import { createFileRoute } from '@tanstack/react-router'
import { Users } from 'lucide-react'

export const Route = createFileRoute('/admin/users')({ component: AdminUsersPage })

function AdminUsersPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-xl font-semibold tracking-tight">Utilisateurs</h1>
      <p className="mt-1 text-sm text-muted-foreground">Gestion des comptes, suspensions et reactivations.</p>

      <div className="mt-6 flex flex-col items-center gap-2 py-12 text-center">
        <Users className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">La liste des utilisateurs sera affichee ici.</p>
      </div>
    </div>
  )
}

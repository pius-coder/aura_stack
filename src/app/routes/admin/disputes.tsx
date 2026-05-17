import { createFileRoute } from '@tanstack/react-router'
import { AlertTriangle } from 'lucide-react'

export const Route = createFileRoute('/admin/disputes')({ component: AdminDisputesPage })

function AdminDisputesPage() {
  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="text-xl font-semibold tracking-tight">Litiges</h1>
      <p className="mt-1 text-sm text-muted-foreground">Gestion des signalements et litiges utilisateurs.</p>

      <div className="mt-6 flex flex-col items-center gap-2 py-12 text-center">
        <AlertTriangle className="h-8 w-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Aucun litige en attente.</p>
      </div>
    </div>
  )
}

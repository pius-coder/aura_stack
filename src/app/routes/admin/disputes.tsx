import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/admin/disputes')({ component: AdminDisputesPage })

function AdminDisputesPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold">Litiges</h1>
      <p className="mt-2 text-sm text-white/60">Liste des litiges avec actions resolve. Connecté à disputes.resolve.</p>
    </div>
  )
}

import { createFileRoute } from '@tanstack/react-router'
import { Card, CardDescription, CardHeader, CardTitle } from '@/aura/ui/card'
import { Users, AlertTriangle, TrendingUp, MessageSquare } from 'lucide-react'

export const Route = createFileRoute('/admin/')({ component: AdminDashboard })

function AdminDashboard() {
  return (
    <div className="mx-auto max-w-4xl">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Administration</p>
        <h1 className="text-xl font-semibold tracking-tight">Tableau de bord</h1>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <Users className="h-3 w-3" /> Utilisateurs
            </CardDescription>
            <CardTitle className="text-2xl">--</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <TrendingUp className="h-3 w-3" /> Matchs ce mois
            </CardDescription>
            <CardTitle className="text-2xl">--</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <MessageSquare className="h-3 w-3" /> Conversations
            </CardDescription>
            <CardTitle className="text-2xl">--</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription className="flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" /> Litiges ouverts
            </CardDescription>
            <CardTitle className="text-2xl">--</CardTitle>
          </CardHeader>
        </Card>
      </div>

      <p className="mt-8 text-sm text-muted-foreground">
        Les metriques seront connectees aux operations admin une fois le backend actif.
      </p>
    </div>
  )
}

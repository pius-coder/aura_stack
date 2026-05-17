import { createFileRoute } from '@tanstack/react-router'
import { useAuraQuery } from '@/aura/client'
import { api } from '@/aura/_generated/api'
import { Card, CardContent } from '@/aura/ui/card'
import { Badge } from '@/aura/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/aura/ui/tabs'
import { Users } from 'lucide-react'

export const Route = createFileRoute('/app/matches')({ component: MatchesPage })

function MatchesPage() {
  const allMatches = useAuraQuery(api.matching['list-mine'])

  const incoming = allMatches.data?.filter((m: any) => m.isIncoming) ?? []
  const outgoing = allMatches.data?.filter((m: any) => !m.isIncoming) ?? []

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-xl font-semibold tracking-tight">Mes matchs</h1>

      <Tabs defaultValue="received" className="mt-4">
        <TabsList>
          <TabsTrigger value="received">Recus</TabsTrigger>
          <TabsTrigger value="sent">Envoyes</TabsTrigger>
        </TabsList>

        <TabsContent value="received" className="mt-3 space-y-2">
          {incoming.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <Users className="h-6 w-6 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Aucune demande recue.</p>
            </div>
          )}
          {incoming.map((m: any) => (
            <Card key={m.id}>
              <CardContent className="flex items-center justify-between p-3">
                <p className="text-sm font-medium">{m.requester?.alias}</p>
                <Badge variant={m.status === 'PENDING' ? 'secondary' : 'outline'}>
                  {m.status}
                </Badge>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="sent" className="mt-3 space-y-2">
          {outgoing.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <Users className="h-6 w-6 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Aucune demande envoyee.</p>
            </div>
          )}
          {outgoing.map((m: any) => (
            <Card key={m.id}>
              <CardContent className="flex items-center justify-between p-3">
                <p className="text-sm font-medium">{m.target?.alias}</p>
                <Badge variant={m.status === 'PENDING' ? 'secondary' : 'outline'}>
                  {m.status}
                </Badge>
              </CardContent>
            </Card>
          ))}
        </TabsContent>
      </Tabs>
    </div>
  )
}

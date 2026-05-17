import { createFileRoute } from '@tanstack/react-router'
import { useAuraQuery } from '@/aura/client'
import { api } from '@/aura/_generated/api'
import { Card, CardContent } from '@/aura/ui/card'
import { Badge } from '@/aura/ui/badge'
import { MessageSquare } from 'lucide-react'

export const Route = createFileRoute('/app/chat/')({ component: ChatListPage })

function ChatListPage() {
  const convs = useAuraQuery(api.conversations['list-mine'])

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-xl font-semibold tracking-tight">Conversations</h1>

      {convs.data?.length === 0 && (
        <div className="mt-8 flex flex-col items-center gap-2 text-center">
          <MessageSquare className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Aucune conversation pour le moment.</p>
        </div>
      )}

      <div className="mt-4 space-y-2">
        {convs.data?.map((c: any) => (
          <Card key={c.id} className="transition-colors hover:bg-muted/50 cursor-pointer">
            <CardContent className="flex items-center justify-between p-3">
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">
                  Conversation #{c.id.slice(0, 8)}
                </p>
              </div>
              <Badge variant={c.status === 'OPEN' ? 'default' : 'outline'}>
                {c.status === 'OPEN' ? 'Active' : 'Fermee'}
              </Badge>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

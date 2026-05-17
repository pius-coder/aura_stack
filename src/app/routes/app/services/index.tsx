import { createFileRoute } from '@tanstack/react-router'
import { useAuraQuery } from '@/aura/client'
import { api } from '@/aura/_generated/api'
import { Card, CardContent } from '@/aura/ui/card'
import { Button } from '@/aura/ui/button'
import { Badge } from '@/aura/ui/badge'
import { Plus, MapPin } from 'lucide-react'

export const Route = createFileRoute('/app/services/')({ component: ServicesPage })

function ServicesPage() {
  const services = useAuraQuery(api.services['list-mine'])

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold tracking-tight">Mes services</h1>
        <Button size="sm" className="gap-1 text-[10px] font-bold uppercase tracking-wider">
          <Plus className="h-3 w-3" />
          Nouveau
        </Button>
      </div>

      {services.data?.length === 0 && (
        <p className="mt-6 text-sm text-muted-foreground">Aucun service publie.</p>
      )}

      <div className="mt-4 space-y-2">
        {services.data?.map((s) => (
          <Card key={s.id}>
            <CardContent className="flex items-center justify-between p-3">
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">{s.title}</p>
                <div className="mt-0.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                  {s.zone && (
                    <span className="flex items-center gap-0.5">
                      <MapPin className="h-2.5 w-2.5" />
                      {s.zone}
                    </span>
                  )}
                  <span>{s.priceXaf} FCFA</span>
                </div>
              </div>
              <Badge variant={s.isActive ? 'default' : 'outline'}>
                {s.isActive ? 'Actif' : 'Inactif'}
              </Badge>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

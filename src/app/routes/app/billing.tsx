import { createFileRoute } from '@tanstack/react-router'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/aura/ui/card'
import { Button } from '@/aura/ui/button'
import { Badge } from '@/aura/ui/badge'
import { Check } from 'lucide-react'

export const Route = createFileRoute('/app/billing')({ component: BillingPage })

function BillingPage() {
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-xl font-semibold tracking-tight">Abonnement</h1>
      <p className="mt-1 text-sm text-muted-foreground">Les paiements seront actives prochainement.</p>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Badge Verifie</CardTitle>
            <CardDescription>Confiance et visibilite</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-black">10 000 <span className="text-xs font-normal text-muted-foreground">FCFA/an</span></p>
            <ul className="mt-3 space-y-1.5 text-[11px] text-muted-foreground">
              <li className="flex items-center gap-1.5"><Check className="h-3 w-3 text-secondary" />Badge visible</li>
              <li className="flex items-center gap-1.5"><Check className="h-3 w-3 text-secondary" />Priorite +10%</li>
            </ul>
            <Button variant="outline" size="sm" className="mt-4 w-full" disabled>Bientot</Button>
          </CardContent>
        </Card>

        <Card className="border-primary">
          <CardHeader className="pb-2">
            <Badge className="w-fit text-[9px]">Populaire</Badge>
            <CardTitle className="text-sm">Boost</CardTitle>
            <CardDescription>Top 3 pendant 7 jours</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-black">1 000 <span className="text-xs font-normal text-muted-foreground">FCFA/7j</span></p>
            <ul className="mt-3 space-y-1.5 text-[11px] text-muted-foreground">
              <li className="flex items-center gap-1.5"><Check className="h-3 w-3 text-primary" />Top 3 resultats</li>
              <li className="flex items-center gap-1.5"><Check className="h-3 w-3 text-primary" />Plus de visibilite</li>
            </ul>
            <Button size="sm" className="mt-4 w-full" disabled>Bientot</Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Pro</CardTitle>
            <CardDescription>Matchs illimites</CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-lg font-black">3 000 <span className="text-xs font-normal text-muted-foreground">FCFA/mois</span></p>
            <ul className="mt-3 space-y-1.5 text-[11px] text-muted-foreground">
              <li className="flex items-center gap-1.5"><Check className="h-3 w-3 text-secondary" />500 matchs/jour</li>
              <li className="flex items-center gap-1.5"><Check className="h-3 w-3 text-secondary" />Support prioritaire</li>
            </ul>
            <Button variant="outline" size="sm" className="mt-4 w-full" disabled>Bientot</Button>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

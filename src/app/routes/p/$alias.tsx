import { createFileRoute } from '@tanstack/react-router'
import { useAuraQuery } from '@/aura/client'
import { api } from '@/aura/_generated/api'
import { Card, CardContent, CardHeader, CardTitle } from '@/aura/ui/card'
import { Badge } from '@/aura/ui/badge'
import { Separator } from '@/aura/ui/separator'
import { MapPin, Star, ShieldCheck } from 'lucide-react'

export const Route = createFileRoute('/p/$alias')({ component: PublicProfilePage })

function PublicProfilePage() {
  const { alias } = Route.useParams()
  const profile = useAuraQuery(api.profiles['get-by-alias'], { input: { alias } })

  if (profile.isLoading) return <p className="p-8 text-sm text-muted-foreground">Chargement...</p>
  if (!profile.data) return <p className="p-8 text-sm text-muted-foreground">Profil introuvable.</p>

  const p = profile.data as any

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle className="text-lg">{p.alias}</CardTitle>
            {p.isVerified && (
              <Badge variant="secondary" className="gap-1 text-[9px]">
                <ShieldCheck className="h-3 w-3" /> Verifie
              </Badge>
            )}
          </div>
          {p.locationLabel && (
            <p className="flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="h-3 w-3" /> {p.locationLabel}
            </p>
          )}
        </CardHeader>
        <CardContent>
          {p.bio && <p className="text-sm text-muted-foreground">{p.bio}</p>}
          {p.ratingAvg && (
            <div className="mt-2 flex items-center gap-1 text-sm">
              <Star className="h-3.5 w-3.5 fill-primary text-primary" />
              <span className="font-semibold">{p.ratingAvg.toFixed(1)}</span>
              <span className="text-xs text-muted-foreground">({p.ratingCount} avis)</span>
            </div>
          )}

          {p.services?.length > 0 && (
            <>
              <Separator className="my-4" />
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Services</p>
              <div className="mt-2 space-y-2">
                {p.services.map((s: any) => (
                  <div key={s.id} className="flex items-center justify-between border border-border p-2">
                    <span className="text-sm font-medium">{s.title}</span>
                    <span className="text-xs font-semibold text-primary">{s.priceXaf} FCFA</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </main>
  )
}

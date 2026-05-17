import { createFileRoute } from '@tanstack/react-router'
import { Card, CardContent } from '@/aura/ui/card'
import { User, Globe, Shield, Lock } from 'lucide-react'

export const Route = createFileRoute('/app/settings')({ component: SettingsPage })

const SETTINGS_ITEMS = [
  { label: 'Profil', desc: 'Nom, bio, photo', icon: User },
  { label: 'Langue', desc: 'Francais / English', icon: Globe },
  { label: 'Securite', desc: 'Mot de passe', icon: Shield },
  { label: 'Confidentialite', desc: 'Consentements et donnees', icon: Lock },
]

function SettingsPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-xl font-semibold tracking-tight">Parametres</h1>
      <div className="mt-4 space-y-2">
        {SETTINGS_ITEMS.map(({ label, desc, icon: Icon }) => (
          <Card key={label} className="transition-colors hover:bg-muted/50 cursor-pointer">
            <CardContent className="flex items-center gap-3 p-3">
              <Icon className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-sm font-medium">{label}</p>
                <p className="text-[10px] text-muted-foreground">{desc}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

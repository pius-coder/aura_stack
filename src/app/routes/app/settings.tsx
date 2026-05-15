import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/app/settings')({ component: SettingsPage })

function SettingsPage() {
  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold">Paramètres</h1>
      <div className="mt-6 space-y-4">
        <a href="/app/settings/profile" className="block rounded-lg border border-white/10 p-4 hover:bg-white/5">Profil</a>
        <a href="/app/settings/language" className="block rounded-lg border border-white/10 p-4 hover:bg-white/5">Langue</a>
        <a href="/app/settings/security" className="block rounded-lg border border-white/10 p-4 hover:bg-white/5">Sécurité</a>
        <a href="/app/settings/privacy" className="block rounded-lg border border-white/10 p-4 hover:bg-white/5">Confidentialité</a>
      </div>
    </div>
  )
}

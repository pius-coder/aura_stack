import { createFileRoute, Link } from '@tanstack/react-router'
import { useAuraQuery } from '@/aura/client'
import { api } from '@/aura/_generated/api'
import { ProfileView } from '@/components/profiles/profile-view'
import { ArrowLeft } from 'lucide-react'

export const Route = createFileRoute('/app/profile')({ component: ProfilePage })

function ProfilePage() {
  const { data } = useAuraQuery(api.auth['vibe-me'])
  const profile = data?.profile

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex items-center gap-3 border-b border-slate-100 px-4 py-3">
        <Link to="/app" className="rounded-full p-1 text-slate-500 hover:bg-slate-100 transition-colors">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <span className="text-sm font-semibold text-slate-900">Profil</span>
      </header>

      <main className="flex-1 overflow-y-auto p-4">
        {profile ? (
          <ProfileView profile={profile} />
        ) : (
          <p className="text-sm text-slate-400 text-center mt-8">Chargement...</p>
        )}
      </main>
    </div>
  )
}

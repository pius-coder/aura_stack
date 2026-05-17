import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { useAuraQuery } from '@/aura/client'
import { api } from '@/aura/_generated/api'
import { OryaChat } from '@/components/chat/orya-chat'
import { AppNav } from '@/components/app/app-nav'
import { Menu } from 'lucide-react'

export const Route = createFileRoute('/app/')({ component: ChatHome })

function ChatHome() {
  const { data } = useAuraQuery(api.auth['vibe-me'])
  const [navOpen, setNavOpen] = useState(false)
  const profile = data?.profile

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-b from-blue-500 to-blue-600">
            <span className="text-[10px] font-bold text-white">O</span>
          </div>
          <span className="text-sm font-semibold text-slate-900">Orya</span>
        </div>
        <button
          type="button"
          onClick={() => setNavOpen(true)}
          className="rounded-full p-1.5 text-slate-500 hover:bg-slate-100 transition-colors"
        >
          <Menu className="h-5 w-5" />
        </button>
      </header>

      <main className="flex-1 overflow-hidden">
        {profile ? (
          <OryaChat hasNoType={false} />
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-xs text-slate-400">Complétez votre profil pour commencer</p>
          </div>
        )}
      </main>

      <AppNav
        open={navOpen}
        onClose={() => setNavOpen(false)}
        displayName={profile?.displayName ?? null}
        alias={profile?.alias ?? null}
        isProvider={profile?.isProvider ?? true}
        isVerified={profile?.isVerified ?? false}
      />
    </div>
  )
}

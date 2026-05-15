import { createFileRoute } from '@tanstack/react-router'
import { useAuraQuery } from '@/aura/client'
import { api } from '@/aura/_generated/api'

export const Route = createFileRoute('/app/chat/')({ component: ChatListPage })

function ChatListPage() {
  const convs = useAuraQuery(api.chat['list-conversations'])
  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-bold">Conversations</h1>
      {convs.data?.length === 0 && <p className="mt-4 text-sm text-white/50">Aucune conversation.</p>}
      {convs.data?.map((c: any) => (
        <a key={c.id} href={`/app/chat/${c.id}`} className="mt-2 block rounded-lg border border-white/10 p-3 text-sm hover:bg-white/5">
          Conversation #{c.id.slice(0, 8)} — {c.status}
        </a>
      ))}
    </div>
  )
}

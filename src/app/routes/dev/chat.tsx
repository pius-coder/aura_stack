import { createFileRoute } from '@tanstack/react-router'
import { useState, useRef, useEffect } from 'react'

export const Route = createFileRoute('/dev/chat')({ component: DevChatPage })

const PHONES = [
  { label: 'Alice (+237612345678)', value: '+237612345678' },
  { label: 'Bob (+237698765432)', value: '+237698765432' },
  { label: 'Clara (+237655000111)', value: '+237655000111' },
]

interface Message {
  id: string
  from: 'user' | 'bot'
  text: string
  time: string
}

interface Tab {
  id: string
  label: string
  phone: string
  messages: Message[]
  loading: boolean
}

function DevChatPage() {
  const [tabs, setTabs] = useState<Tab[]>([
    { id: '1', label: 'Alice', phone: '+237612345678', messages: [], loading: false },
    { id: '2', label: 'Bob', phone: '+237698765432', messages: [], loading: false },
  ])
  const [activeTab, setActiveTab] = useState('1')

  const active = tabs.find((t) => t.id === activeTab)!

  function addTab() {
    const used = tabs.map((t) => t.phone)
    const avail = PHONES.find((p) => !used.includes(p.value))
    if (!avail) return
    const id = String(Date.now())
    setTabs((prev) => [...prev, { id, label: avail.label.split('(')[0].trim(), phone: avail.value, messages: [], loading: false }])
    setActiveTab(id)
  }

  function closeTab(id: string) {
    setTabs((prev) => {
      const next = prev.filter((t) => t.id !== id)
      if (activeTab === id && next.length > 0) setActiveTab(next[next.length - 1].id)
      return next
    })
  }

  return (
    <div className="mx-auto flex h-screen max-w-6xl flex-col bg-slate-50">
      {/* Tab bar */}
      <div className="flex items-center border-b bg-white px-2 pt-2">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex cursor-pointer items-center gap-2 rounded-t-lg px-4 py-2 text-xs font-medium transition-colors ${
              tab.id === activeTab ? 'bg-slate-50 text-slate-900' : 'text-slate-400 hover:text-slate-700'
            }`}
          >
            <span className={`h-2 w-2 rounded-full ${tab.id === activeTab ? 'bg-emerald-500' : 'bg-slate-300'}`} />
            {tab.label}
            {tabs.length > 1 && (
              <button
                onClick={(e) => { e.stopPropagation(); closeTab(tab.id) }}
                className="ml-1 text-slate-300 hover:text-red-500"
              >
                ×
              </button>
            )}
          </div>
        ))}
        {tabs.length < PHONES.length && (
          <button onClick={addTab} className="ml-1 rounded-lg px-3 py-2 text-xs text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            + Ajouter
          </button>
        )}
      </div>

      {/* Chat panel */}
      <div className="flex flex-1 overflow-hidden">
        <ChatPanel
          key={active.id}
          tab={active}
          onUpdate={(msg) => {
            setTabs((prev) =>
              prev.map((t) => (t.id === active.id ? { ...t, messages: [...t.messages, msg], loading: false } : t)),
            )
          }}
          onLoading={(loading) => {
            setTabs((prev) => prev.map((t) => (t.id === active.id ? { ...t, loading } : t)))
          }}
        />
      </div>

      {/* Dev badge */}
      <div className="flex items-center justify-between border-t bg-amber-50 px-4 py-1.5">
        <span className="text-[10px] text-amber-700 font-medium">🧪 Mode développement — les messages simulent le webhook WhatsApp</span>
        <a href="/" className="text-[10px] text-amber-600 underline">Retour au site</a>
      </div>
    </div>
  )
}

function ChatPanel({ tab, onUpdate, onLoading }: {
  tab: Tab
  onUpdate: (msg: Message) => void
  onLoading: (l: boolean) => void
}) {
  const [input, setInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [tab.messages])

  async function send() {
    const text = input.trim()
    if (!text || tab.loading) return
    setInput('')

    const userMsg: Message = { id: crypto.randomUUID(), from: 'user', text, time: new Date().toLocaleTimeString() }
    onUpdate(userMsg)

    onLoading(true)
    try {
      const res = await fetch('/aura-internal/agent.chat-dev', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneE164: tab.phone, text }),
      })
      const data = await res.json()
      const botMsg: Message = { id: crypto.randomUUID(), from: 'bot', text: data.reply ?? '(pas de réponse)', time: new Date().toLocaleTimeString() }
      onUpdate(botMsg)
    } catch {
      const botMsg: Message = { id: crypto.randomUUID(), from: 'bot', text: '(erreur de connexion)', time: new Date().toLocaleTimeString() }
      onUpdate(botMsg)
    }
  }

  return (
    <div className="flex flex-1 flex-col bg-white">
      {/* Contact header */}
      <div className="flex items-center gap-3 border-b bg-white px-5 py-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-700">
          {tab.label[0]}
        </div>
        <div>
          <p className="text-sm font-medium text-slate-900">{tab.label}</p>
          <p className="text-[11px] text-slate-400">{tab.phone}</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <select
            value={tab.phone}
            onChange={() => {}}
            className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] text-slate-500"
          >
            {PHONES.map((p) => (
              <option key={p.value} value={p.value}>{p.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 space-y-2 overflow-y-auto px-5 py-4">
        {tab.messages.length === 0 && (
          <div className="flex h-full items-center justify-center">
            <p className="text-xs text-slate-300">Envoyez un message pour commencer la conversation.</p>
          </div>
        )}
        {tab.messages.map((m) => (
          <div key={m.id} className={`flex ${m.from === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[70%] rounded-2xl px-4 py-2.5 ${
                m.from === 'user'
                  ? 'bg-emerald-500 text-white rounded-br-md'
                  : 'bg-slate-100 text-slate-800 rounded-bl-md'
              }`}
            >
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{m.text}</p>
              <p className={`mt-1 text-[10px] text-right ${m.from === 'user' ? 'text-emerald-100' : 'text-slate-400'}`}>{m.time}</p>
            </div>
          </div>
        ))}
        {tab.loading && (
          <div className="flex justify-start">
            <div className="max-w-[70%] rounded-2xl rounded-bl-md bg-slate-100 px-4 py-3">
              <div className="flex gap-1">
                <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: '0ms' }} />
                <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: '150ms' }} />
                <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t bg-white px-4 py-3">
        <div className="flex items-center gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
            placeholder="Écrivez un message..."
            className="flex-1 rounded-full border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm outline-none focus:border-emerald-400 focus:bg-white"
          />
          <button
            onClick={send}
            disabled={!input.trim() || tab.loading}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-500 text-white disabled:opacity-40 hover:bg-emerald-600 transition-colors"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14M12 5l7 7-7 7" /></svg>
          </button>
        </div>
      </div>
    </div>
  )
}

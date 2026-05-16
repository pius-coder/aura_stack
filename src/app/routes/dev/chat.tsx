import { createFileRoute } from '@tanstack/react-router'
import { useState, useRef, useEffect } from 'react'

export const Route = createFileRoute('/dev/chat')({ component: DevChatPage })

/* ─── Types ─────────────────────────────────────── */

interface Message { id: string; from: 'me' | 'orya'; text: string; time: string }

/* ─── State ─────────────────────────────────────── */

const PRESETS = [
  { name: 'Alice', phone: '+237612345678' },
  { name: 'Bob', phone: '+237698765432' },
  { name: 'Clara', phone: '+237655000111' },
  { name: 'Marcel', phone: '+237699000111' },
]

function makeContact(name: string, phone: string) {
  const c = ['bg-emerald-500', 'bg-blue-500', 'bg-violet-500', 'bg-amber-500', 'bg-rose-500']
  return { id: phone, name, phone, color: c[Math.floor(Math.random() * c.length)], lastMsg: '', lastTime: '', unread: 0 }
}

/* ─── Page ──────────────────────────────────────── */

function DevChatPage() {
  const [contacts, setContacts] = useState(() => PRESETS.map((p) => makeContact(p.name, p.phone)))
  const [activePhone, setActivePhone] = useState(contacts[0]?.phone ?? '')
  const [messages, setMessages] = useState<Record<string, Message[]>>({})
  const [loading, setLoading] = useState<Record<string, boolean>>({})
  const [showNew, setShowNew] = useState(false)
  const [newName, setNewName] = useState('')
  const [newPhone, setNewPhone] = useState('')

  const activeMsgs = messages[activePhone] ?? []
  const activeLoading = loading[activePhone] ?? false

  function addContact(name: string, phone: string) {
    if (!name.trim() || !phone.trim() || contacts.some((c) => c.phone === phone)) return
    setContacts((prev) => [...prev, { ...makeContact(name, phone), lastMsg: 'Nouveau contact' }])
    setNewName(''); setNewPhone(''); setShowNew(false); setActivePhone(phone)
  }

  function pushMsg(phone: string, msg: Message) {
    setMessages((prev) => ({ ...prev, [phone]: [...(prev[phone] ?? []), msg] }))
    setContacts((prev) => prev.map((c) => c.phone === phone
      ? { ...c, lastMsg: msg.text.slice(0, 50), lastTime: msg.time, unread: phone !== activePhone ? c.unread + 1 : 0 }
      : c))
  }

  return (
    <div className="flex h-screen bg-white">
      {/* Sidebar */}
      <div className="flex w-80 flex-col border-r border-slate-200 bg-slate-50">
        <div className="flex items-center justify-between border-b bg-white px-4 py-3">
          <h1 className="text-sm font-bold text-slate-800">Orya · Dev Chat</h1>
          <a href="/" className="text-[10px] text-amber-600 underline">Site</a>
        </div>
        {/* New contact */}
        <div className="border-b bg-white px-3 py-2">
          {showNew ? (
            <div className="space-y-1.5">
              <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Prénom" className="w-full rounded-lg border px-3 py-1.5 text-xs outline-none focus:border-emerald-400" />
              <input value={newPhone} onChange={(e) => setNewPhone(e.target.value)} placeholder="+237XXXXXXXXX" className="w-full rounded-lg border px-3 py-1.5 text-xs outline-none focus:border-emerald-400" />
              <div className="flex gap-1">
                <button onClick={() => addContact(newName, newPhone)} className="rounded-lg bg-emerald-500 px-3 py-1 text-[10px] text-white hover:bg-emerald-600">Ajouter</button>
                <button onClick={() => setShowNew(false)} className="rounded-lg px-3 py-1 text-[10px] text-slate-400">Annuler</button>
              </div>
            </div>
          ) : (
            <button onClick={() => setShowNew(true)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-slate-500 hover:bg-slate-100">
              <span className="flex h-5 w-5 items-center justify-center rounded-full border text-[12px]">+</span>
              Nouveau contact
            </button>
          )}
        </div>
        {/* Contact list */}
        <div className="flex-1 overflow-y-auto">
          {contacts.map((c) => (
            <div key={c.id} onClick={() => { setActivePhone(c.phone); setContacts((prev) => prev.map((x) => x.phone === c.phone ? { ...x, unread: 0 } : x)) }}
              className={`flex cursor-pointer items-center gap-3 border-b border-slate-100 px-4 py-3 transition-colors hover:bg-white ${c.phone === activePhone ? 'bg-white' : ''}`}>
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white ${c.color}`}>{c.name[0]}</div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between">
                  <p className={`text-sm truncate ${c.unread > 0 ? 'font-bold' : 'font-medium'} text-slate-800`}>{c.name}</p>
                  {c.lastTime && <span className="text-[10px] text-slate-400">{c.lastTime}</span>}
                </div>
                <p className="truncate text-[11px] text-slate-400">{c.lastMsg}</p>
              </div>
              {c.unread > 0 && <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-[9px] font-bold text-white">{c.unread}</span>}
            </div>
          ))}
        </div>
        <div className="border-t bg-white px-4 py-2">
          <p className="text-[9px] text-amber-600 font-medium">🧪 Simulation via agent.chat-dev</p>
          <p className="text-[8px] text-slate-400">Messages traités par l'agent Orya</p>
        </div>
      </div>

      {/* Chat */}
      <div className="flex flex-1 flex-col">
        {activePhone ? (
          <Conversation
            contact={contacts.find((c) => c.phone === activePhone)!}
            messages={activeMsgs}
            loading={activeLoading}
            onMsg={(m) => pushMsg(activePhone, m)}
            onLoad={(v) => setLoading((prev) => ({ ...prev, [activePhone]: v }))}
          />
        ) : (
          <div className="flex flex-1 items-center justify-center text-xs text-slate-300">Sélectionnez un contact</div>
        )}
      </div>
    </div>
  )
}

/* ─── Conversation ──────────────────────────────── */

function Conversation({ contact, messages, loading, onMsg, onLoad }: {
  contact: any; messages: Message[]; loading: boolean; onMsg: (m: Message) => void; onLoad: (v: boolean) => void
}) {
  const [input, setInput] = useState('')
  const [typing, setTyping] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const tmr = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages, typing])

  async function send() {
    const text = input.trim()
    if (!text || loading) return
    setInput(''); setTyping(false)

    onMsg({ id: crypto.randomUUID(), from: 'me', text, time: new Date().toLocaleTimeString() })
    onLoad(true)

    try {
      const res = await fetch('/aura-internal/agent.chat-dev', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phoneE164: contact.phone, text }),
      })
      const data = await res.json()
      onMsg({ id: crypto.randomUUID(), from: 'orya', text: data.reply ?? '(pas de réponse)', time: new Date().toLocaleTimeString() })
    } catch {
      onMsg({ id: crypto.randomUUID(), from: 'orya', text: '(erreur)', time: new Date().toLocaleTimeString() })
    }
    onLoad(false)
  }

  return (
    <>
      <div className="flex items-center gap-3 border-b bg-white px-5 py-3 shadow-sm">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white ${contact.color}`}>{contact.name[0]}</div>
        <div>
          <p className="text-sm font-semibold text-slate-900">{contact.name}</p>
          <p className="text-[11px] text-emerald-600">Orya · en ligne</p>
        </div>
        <div className="ml-auto text-[11px] text-slate-400">{contact.phone}</div>
      </div>

      <div className="flex-1 overflow-y-auto bg-[#efeae2] px-4 py-4">
        <div className="mb-4 text-center">
          <span className="inline-block rounded-full bg-white/80 px-3 py-1 text-[10px] text-slate-500 shadow-sm">
            Vous discutez avec Orya — mode développement
          </span>
        </div>
        {messages.map((m) => (
          <div key={m.id} className={`mb-2 flex ${m.from === 'me' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[75%] rounded-2xl px-4 py-2.5 shadow-sm ${m.from === 'me' ? 'bg-[#d9fdd3] rounded-br-sm' : 'bg-white rounded-bl-sm'}`}>
              <p className="text-sm leading-relaxed whitespace-pre-wrap text-slate-800">{m.text}</p>
              <p className={`mt-0.5 text-[9px] text-right ${m.from === 'me' ? 'text-emerald-700/60' : 'text-slate-400'}`}>{m.time}</p>
            </div>
          </div>
        ))}
        {typing && (
          <div className="mb-2 flex justify-start">
            <div className="rounded-2xl rounded-bl-sm bg-white px-4 py-3 shadow-sm">
              <div className="flex gap-1"><span className="h-2 w-2 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: '0ms' }} /><span className="h-2 w-2 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: '150ms' }} /><span className="h-2 w-2 animate-bounce rounded-full bg-slate-400" style={{ animationDelay: '300ms' }} /></div>
            </div>
          </div>
        )}
        {loading && (
          <div className="mb-2 flex justify-start">
            <div className="rounded-2xl rounded-bl-sm bg-white px-4 py-3 shadow-sm">
              <div className="flex gap-1"><span className="h-2 w-2 animate-bounce rounded-full bg-emerald-400" style={{ animationDelay: '0ms' }} /><span className="h-2 w-2 animate-bounce rounded-full bg-emerald-400" style={{ animationDelay: '150ms' }} /><span className="h-2 w-2 animate-bounce rounded-full bg-emerald-400" style={{ animationDelay: '300ms' }} /></div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="border-t bg-white px-4 py-3">
        <div className="flex items-center gap-2">
          <input value={input} onChange={(e) => { setInput(e.target.value); setTyping(true); clearTimeout(tmr.current); tmr.current = setTimeout(() => setTyping(false), 1500) }}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
            placeholder="Écrivez un message à Orya..." className="flex-1 rounded-full border border-slate-200 bg-slate-50 px-5 py-3 text-sm outline-none focus:border-emerald-400 focus:bg-white" />
          <button onClick={send} disabled={!input.trim() || loading}
            className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-500 text-white disabled:opacity-40 hover:bg-emerald-600 transition-colors shadow-sm">
            <svg className="h-4 w-4 rotate-45" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19V5M5 12l7-7 7 7" /></svg>
          </button>
        </div>
      </div>
    </>
  )
}

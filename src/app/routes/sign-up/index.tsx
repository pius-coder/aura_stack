import { useState } from 'react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { parsePhoneNumberFromString } from 'libphonenumber-js'
import { useAuraMutation } from '@/aura/client'
import { api } from '@/aura/_generated/api'

export const Route = createFileRoute('/sign-up/')({ component: SignUpPhonePage })

function SignUpPhonePage() {
  const navigate = useNavigate()
  const [phone, setPhone] = useState('')
  const [error, setError] = useState('')

  const startOtp = useAuraMutation(api.auth['start-phone-otp'], {
    onSuccess: (data) => {
      const e164 = parsePhoneNumberFromString(`+237${phone.replace(/\s/g, '')}`, 'CM')!.format('E.164')
      navigate({ to: '/sign-up/verify', search: { challengeId: data.challengeId, phone: e164 } })
    },
    onError: (e) => setError(e.message),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const cleaned = phone.replace(/\s/g, '')
    const parsed = parsePhoneNumberFromString(`+237${cleaned}`, 'CM')
    if (!parsed?.isValid()) { setError('Numéro invalide'); return }
    setError('')
    startOtp.mutate({ phoneE164: parsed.format('E.164') })
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-zinc-900 p-8">
        <h1 className="text-xl font-bold text-white">Créer un compte</h1>
        <p className="mt-2 text-sm text-white/60">
          Entrez votre numéro. Vous recevrez un code par WhatsApp.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-3">
          <div className="flex items-center gap-2">
            <span className="shrink-0 rounded-lg border border-white/10 bg-zinc-800 px-3 py-2.5 text-sm text-white/70">+237</span>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="6 97 00 00 00"
              type="tel"
              autoFocus
              className="flex-1 rounded-lg border border-white/10 bg-zinc-800 px-3 py-2.5 text-sm text-white placeholder:text-white/30 focus:border-white/30 focus:outline-none"
            />
          </div>
          <button type="submit" disabled={startOtp.isPending} className="w-full rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-black disabled:opacity-50">
            {startOtp.isPending ? 'Envoi…' : 'Recevoir le code'}
          </button>
        </form>

        {error && <p className="mt-4 text-center text-xs text-red-400">{error}</p>}

        <p className="mt-6 text-center text-xs text-white/40">
          Déjà inscrit ? <Link to="/sign-in" className="text-white underline">Se connecter</Link>
        </p>
      </div>
    </div>
  )
}

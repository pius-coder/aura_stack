import { useState } from 'react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { parsePhoneNumberFromString } from 'libphonenumber-js'
import { useAuraMutation } from '@/aura/client'
import { api } from '@/aura/_generated/api'

export const Route = createFileRoute('/sign-in')({ component: SignInPage })

function SignInPage() {
  const navigate = useNavigate()
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const login = useAuraMutation(api.auth.login, {
    onSuccess: () => navigate({ to: '/app' }),
    onError: (e) => setError(e.message),
  })

  const formatPhone = (raw: string) => {
    const cleaned = raw.replace(/\s/g, '')
    if (cleaned.startsWith('+')) return cleaned
    if (cleaned.startsWith('237')) return `+${cleaned}`
    return `+237${cleaned}`
  }

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault()
    const parsed = parsePhoneNumberFromString(formatPhone(phone), 'CM')
    if (!parsed?.isValid()) { setError('Numéro invalide'); return }
    setError('')
    login.mutate({
      countryCode: '237',
      phoneNumber: parsed.nationalNumber,
      password,
    })
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-zinc-900 p-8">
        <h1 className="text-xl font-bold text-white">Connexion</h1>
        <p className="mt-2 text-sm text-white/60">Entrez votre numéro et mot de passe.</p>

        <form onSubmit={handleLogin} className="mt-6 space-y-3">
          <div className="flex items-center gap-2">
            <span className="rounded-lg border border-white/10 bg-zinc-800 px-3 py-2.5 text-sm text-white/70">+237</span>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="6 97 00 00 00"
              type="tel"
              className="flex-1 rounded-lg border border-white/10 bg-zinc-800 px-3 py-2.5 text-sm text-white placeholder:text-white/30 focus:border-white/30 focus:outline-none"
            />
          </div>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Mot de passe"
            type="password"
            className="w-full rounded-lg border border-white/10 bg-zinc-800 px-3 py-2.5 text-sm text-white placeholder:text-white/30 focus:border-white/30 focus:outline-none"
          />
          <button type="submit" disabled={login.isPending} className="w-full rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-black disabled:opacity-50">
            {login.isPending ? 'Connexion…' : 'Se connecter'}
          </button>
        </form>

        {error && <p className="mt-4 text-center text-xs text-red-400">{error}</p>}

        <p className="mt-6 text-center text-xs text-white/40">
          Pas de compte ? <Link to="/sign-up" className="text-white underline">S'inscrire</Link>
        </p>
      </div>
    </div>
  )
}

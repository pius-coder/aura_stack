import { useState } from 'react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { parsePhoneNumberFromString } from 'libphonenumber-js'
import { useAuraQuery, useAuraMutation } from '@/aura/client'
import { api } from '@/aura/_generated/api'
import { ArrowRight } from 'lucide-react'

export const Route = createFileRoute('/sign-in')({ component: SignInPage })

function SignInPage() {
  const navigate = useNavigate()
  const { data, isLoading } = useAuraQuery(api.auth['vibe-me'])
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  if (!isLoading && data?.user) {
    navigate({ to: '/app' })
    return null
  }

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
    if (!parsed?.isValid()) { setError('Numero invalide'); return }
    setError('')
    login.mutate({ countryCode: '237', phoneNumber: parsed.nationalNumber, password })
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center px-4 py-12">
      {/* Background */}
      <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
        <div className="absolute -top-[20%] -right-[15%] h-[40vw] w-[40vw] rounded-full bg-blue-200/30 blur-[7rem]" />
        <div className="absolute -bottom-[20%] -left-[15%] h-[50vw] w-[50vw] rounded-full bg-sky-200/20 blur-[8rem]" />
        <div className="absolute inset-0 opacity-[0.18]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(15,23,42,0.09) 1px, transparent 0)', backgroundSize: '2rem 2rem' }} />
      </div>

      <div className="w-full max-w-sm">
        {/* Header */}
        <div className="text-center mb-8">
          <Link to="/" className="text-2xl font-black tracking-[-0.06em] text-slate-950">Orya</Link>
          <p className="mt-2 text-sm text-slate-500 font-light">Connectez-vous a votre compte</p>
        </div>

        {/* Form card */}
        <div className="rounded-2xl bg-white/72 backdrop-blur border border-white p-6 shadow-card">
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-700">Telephone</label>
              <div className="flex gap-2">
                <span className="flex items-center rounded-xl bg-slate-100 border border-slate-200 px-3 text-xs text-slate-500 shadow-inset-highlight">+237</span>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="6 97 00 00 00"
                  type="tel"
                  className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 shadow-inset-highlight focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-700">Mot de passe</label>
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mot de passe"
                type="password"
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 shadow-inset-highlight focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300"
              />
            </div>
            {error && <p className="text-xs text-red-500 font-medium">{error}</p>}
            <button
              type="submit"
              disabled={login.isPending}
              className="w-full inline-flex items-center justify-center gap-2 rounded-full py-3 bg-gradient-to-b from-blue-500 to-blue-600 border border-blue-700 text-white text-sm font-medium shadow-btn-primary hover:-translate-y-0.5 transition-all disabled:opacity-50"
            >
              {login.isPending ? 'Connexion...' : 'Se connecter'}
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-slate-500">
          Pas de compte ?{' '}
          <Link to="/sign-up" className="font-medium text-blue-600 hover:underline">S'inscrire</Link>
        </p>
      </div>
    </div>
  )
}

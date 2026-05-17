import { useState } from 'react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { parsePhoneNumberFromString } from 'libphonenumber-js'
import { useAuraMutation } from '@/aura/client'
import { api } from '@/aura/_generated/api'
import { ArrowRight } from 'lucide-react'

export const Route = createFileRoute('/sign-up/')({ component: SignUpPage })

function SignUpPage() {
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
    const parsed = parsePhoneNumberFromString(`+237${phone.replace(/\s/g, '')}`, 'CM')
    if (!parsed?.isValid()) { setError('Numero invalide'); return }
    setError('')
    startOtp.mutate({ phoneE164: parsed.format('E.164') })
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center px-4 py-12">
      <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
        <div className="absolute -top-[20%] -left-[15%] h-[40vw] w-[40vw] rounded-full bg-blue-200/30 blur-[7rem]" />
        <div className="absolute -bottom-[20%] -right-[15%] h-[50vw] w-[50vw] rounded-full bg-sky-200/20 blur-[8rem]" />
        <div className="absolute inset-0 opacity-[0.18]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(15,23,42,0.09) 1px, transparent 0)', backgroundSize: '2rem 2rem' }} />
      </div>

      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Link to="/" className="text-2xl font-black tracking-[-0.06em] text-slate-950">Orya</Link>
          <p className="mt-2 text-sm text-slate-500 font-light">Creez votre compte en 30 secondes</p>
        </div>

        <div className="rounded-2xl bg-white/72 backdrop-blur border border-white p-6 shadow-card">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-700">Telephone</label>
              <div className="flex gap-2">
                <span className="flex items-center rounded-xl bg-slate-100 border border-slate-200 px-3 text-xs text-slate-500 shadow-inset-highlight">+237</span>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="6 97 00 00 00"
                  type="tel"
                  autoFocus
                  className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 shadow-inset-highlight focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300"
                />
              </div>
            </div>
            {error && <p className="text-xs text-red-500 font-medium">{error}</p>}
            <button
              type="submit"
              disabled={startOtp.isPending}
              className="w-full inline-flex items-center justify-center gap-2 rounded-full py-3 bg-gradient-to-b from-blue-500 to-blue-600 border border-blue-700 text-white text-sm font-medium shadow-btn-primary hover:-translate-y-0.5 transition-all disabled:opacity-50"
            >
              {startOtp.isPending ? 'Envoi...' : 'Recevoir le code'}
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-slate-500">
          Deja inscrit ?{' '}
          <Link to="/sign-in" className="font-medium text-blue-600 hover:underline">Se connecter</Link>
        </p>
      </div>
    </div>
  )
}

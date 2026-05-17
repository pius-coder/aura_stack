import { useState } from 'react'
import { createFileRoute, Link, useNavigate, useSearch } from '@tanstack/react-router'
import { useAuraMutation } from '@/aura/client'
import { api } from '@/aura/_generated/api'
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/aura/ui/input-otp'
import { ArrowRight } from 'lucide-react'

export const Route = createFileRoute('/sign-up/verify')({
  validateSearch: (search: Record<string, unknown>) => ({
    challengeId: String(search.challengeId ?? ''),
    phone: String(search.phone ?? ''),
  }),
  component: VerifyPage,
})

function VerifyPage() {
  const navigate = useNavigate()
  const { challengeId, phone } = useSearch({ from: '/sign-up/verify' })
  const [otp, setOtp] = useState('')
  const [error, setError] = useState('')

  const verify = useAuraMutation(api.auth['verify-phone-otp'], {
    onSuccess: () => navigate({ to: '/onboarding' }),
    onError: (e) => setError(e.message),
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (otp.length < 8) return
    setError('')
    verify.mutate({ phoneE164: phone, code: otp, challengeId })
  }

  if (!challengeId || !phone) {
    navigate({ to: '/sign-up' })
    return null
  }

  return (
    <div className="relative min-h-screen flex items-center justify-center px-4 py-12">
      <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none">
        <div className="absolute -top-[20%] -right-[15%] h-[40vw] w-[40vw] rounded-full bg-blue-200/30 blur-[7rem]" />
        <div className="absolute -bottom-[20%] -left-[15%] h-[50vw] w-[50vw] rounded-full bg-sky-200/20 blur-[8rem]" />
        <div className="absolute inset-0 opacity-[0.18]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(15,23,42,0.09) 1px, transparent 0)', backgroundSize: '2rem 2rem' }} />
      </div>

      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <Link to="/" className="text-2xl font-black tracking-[-0.06em] text-slate-950">Orya</Link>
          <p className="mt-2 text-sm text-slate-500 font-light">Code envoye au {phone}</p>
        </div>

        <div className="rounded-2xl bg-white/72 backdrop-blur border border-white p-6 shadow-card">
          <form onSubmit={handleSubmit} className="flex flex-col items-center gap-5">
            <InputOTP maxLength={8} value={otp} onChange={(v) => setOtp(v)}>
              <InputOTPGroup>
                {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
                  <InputOTPSlot key={i} index={i} />
                ))}
              </InputOTPGroup>
            </InputOTP>
            {error && <p className="text-xs text-red-500 font-medium">{error}</p>}
            <button
              type="submit"
              disabled={otp.length < 8 || verify.isPending}
              className="w-full inline-flex items-center justify-center gap-2 rounded-full py-3 bg-gradient-to-b from-blue-500 to-blue-600 border border-blue-700 text-white text-sm font-medium shadow-btn-primary hover:-translate-y-0.5 transition-all disabled:opacity-50"
            >
              {verify.isPending ? 'Verification...' : 'Verifier'}
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-slate-500">
          <button onClick={() => navigate({ to: '/sign-up' })} className="font-medium text-blue-600 hover:underline">
            Changer de numero
          </button>
        </p>
      </div>
    </div>
  )
}

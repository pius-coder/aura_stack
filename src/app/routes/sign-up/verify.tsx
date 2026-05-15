import { useState } from 'react'
import { createFileRoute, useNavigate, useSearch } from '@tanstack/react-router'
import { useAuraMutation } from '@/aura/client'
import { api } from '@/aura/_generated/api'
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/aura/ui/input-otp'

export const Route = createFileRoute('/sign-up/verify')({
  validateSearch: (search: Record<string, unknown>) => ({
    challengeId: String(search.challengeId ?? ''),
    phone: String(search.phone ?? ''),
  }),
  component: VerifyOtpPage,
})

function VerifyOtpPage() {
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
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-zinc-900 p-8">
        <h1 className="text-xl font-bold text-white">Vérification</h1>
        <p className="mt-2 text-sm text-white/60">
          Entrez le code à 8 chiffres envoyé sur WhatsApp au {phone}
        </p>

        <form onSubmit={handleSubmit} className="mt-6 flex flex-col items-center gap-4">
          <InputOTP maxLength={8} value={otp} onChange={(v) => setOtp(v)}>
            <InputOTPGroup>
              {[0,1,2,3,4,5,6,7].map((i) => <InputOTPSlot key={i} index={i} />)}
            </InputOTPGroup>
          </InputOTP>
          <button type="submit" disabled={otp.length < 8 || verify.isPending} className="w-full rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-black disabled:opacity-50">
            {verify.isPending ? 'Vérification…' : 'Vérifier'}
          </button>
        </form>

        {error && <p className="mt-4 text-center text-xs text-red-400">{error}</p>}

        <button onClick={() => navigate({ to: '/sign-up' })} className="mt-4 block w-full text-center text-xs text-white/50 hover:text-white">
          ← Changer de numéro
        </button>
      </div>
    </div>
  )
}

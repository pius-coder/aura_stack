import { useState } from 'react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { parsePhoneNumberFromString } from 'libphonenumber-js'
import { useAuraMutation } from '@/aura/client'
import { api } from '@/aura/_generated/api'
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/aura/ui/input-otp'

export const Route = createFileRoute('/sign-up')({ component: SignUpPage })

function SignUpPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState<'phone' | 'otp'>('phone')
  const [phone, setPhone] = useState('')
  const [challengeId, setChallengeId] = useState('')
  const [otp, setOtp] = useState('')
  const [error, setError] = useState('')

  const startOtp = useAuraMutation(api.auth['start-phone-otp'], {
    onSuccess: (data) => { setChallengeId(data.challengeId); setStep('otp'); setError('') },
    onError: (e) => setError(e.message),
  })

  const verifyOtp = useAuraMutation(api.auth['verify-phone-otp'], {
    onSuccess: () => navigate({ to: '/onboarding' }),
    onError: (e) => setError(e.message),
  })

  // Cameroun par défaut — on ajoute +237 automatiquement
  const formatPhone = (raw: string) => {
    const cleaned = raw.replace(/\s/g, '')
    if (cleaned.startsWith('+')) return cleaned
    if (cleaned.startsWith('237')) return `+${cleaned}`
    return `+237${cleaned}`
  }
  const phoneE164 = parsePhoneNumberFromString(formatPhone(phone), 'CM')?.format('E.164') ?? ''
  const phoneValid = !!parsePhoneNumberFromString(formatPhone(phone), 'CM')?.isValid()

  const handleSendCode = () => {
    if (!phoneValid) { setError('Numéro invalide. Ex: 6 97 00 00 00'); return }
    setError('')
    startOtp.mutate({ phoneE164 })
  }

  const handleVerify = () => {
    if (otp.length < 8) return
    setError('')
    verifyOtp.mutate({ phoneE164, code: otp, challengeId })
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-zinc-900 p-8">
        <h1 className="text-xl font-bold text-white">Créer un compte</h1>

        {step === 'phone' ? (
          <>
            <p className="mt-2 text-sm text-white/60">
              Entrez votre numéro de téléphone. Vous recevrez un code par WhatsApp.
            </p>
            <div className="mt-6 space-y-3">
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
              <button onClick={handleSendCode} disabled={startOtp.isPending} className="w-full rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-black disabled:opacity-50">
                {startOtp.isPending ? 'Envoi…' : 'Recevoir le code'}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="mt-2 text-sm text-white/60">
              Code envoyé sur WhatsApp au {phoneE164}
            </p>
            <div className="mt-6 flex flex-col items-center gap-4">
              <InputOTP maxLength={8} value={otp} onChange={(v) => setOtp(v)}>
                <InputOTPGroup>
                  {[0,1,2,3,4,5,6,7].map((i) => <InputOTPSlot key={i} index={i} />)}
                </InputOTPGroup>
              </InputOTP>
              <button onClick={handleVerify} disabled={otp.length < 8 || verifyOtp.isPending} className="w-full rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-black disabled:opacity-50">
                {verifyOtp.isPending ? 'Vérification…' : 'Vérifier'}
              </button>
              <button onClick={() => { setStep('phone'); setOtp('') }} className="text-xs text-white/50 hover:text-white">
                ← Changer de numéro
              </button>
            </div>
          </>
        )}

        {error && <p className="mt-4 text-center text-xs text-red-400">{error}</p>}

        <p className="mt-6 text-center text-xs text-white/40">
          Déjà inscrit ? <Link to="/sign-in" className="text-white underline">Se connecter</Link>
        </p>
      </div>
    </div>
  )
}

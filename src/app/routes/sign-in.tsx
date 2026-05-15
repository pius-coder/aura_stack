import { useState } from 'react'
import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { parsePhoneNumberFromString } from 'libphonenumber-js'
import { useAuraMutation } from '@/aura/client'
import { api } from '@/aura/_generated/api'
import { VibeLayout } from '@/aura/ui/vibe-layout'
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/aura/ui/input-otp'

export const Route = createFileRoute('/sign-in')({ component: SignInPage })

function SignInPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState<'phone' | 'otp'>('phone')
  const [phone, setPhone] = useState('')
  const [challengeId, setChallengeId] = useState('')
  const [otp, setOtp] = useState('')
  const [error, setError] = useState('')

  const startOtp = useAuraMutation(api.auth['start-phone-otp'], {
    onSuccess: (data) => {
      setChallengeId(data.challengeId)
      setStep('otp')
      setError('')
    },
    onError: (e) => setError(e.message),
  })

  const verifyOtp = useAuraMutation(api.auth['verify-phone-otp'], {
    onSuccess: (data) => {
      navigate({ to: data.isNewUser ? '/onboarding' : '/app' })
    },
    onError: (e) => setError(e.message),
  })

  const phoneE164 = parsePhoneNumberFromString(phone, 'CM')?.format('E.164') ?? ''
  const phoneValid = !!parsePhoneNumberFromString(phone, 'CM')?.isValid()

  const handleSendCode = () => {
    if (!phoneValid) { setError('Numéro invalide'); return }
    setError('')
    startOtp.mutate({ phoneE164 })
  }

  const handleVerify = () => {
    if (otp.length < 8) return
    setError('')
    verifyOtp.mutate({ phoneE164, code: otp, challengeId })
  }

  return (
    <VibeLayout hideNav>
      <section className="relative mx-auto flex w-full max-w-md flex-col items-center px-5 pb-16 pt-16 sm:pt-24">
        <div className="vibe-card w-full p-8 sm:p-10">
          <span className="vibe-eyebrow">Connexion</span>
          <h1 className="vibe-display mt-3 text-3xl">Bon retour sur Vibe</h1>

          {step === 'phone' ? (
            <>
              <p className="mt-3 text-sm leading-relaxed text-[var(--vibe-fg-muted)]">
                Saisissez votre numéro pour recevoir un code de connexion.
              </p>
              <div className="mt-8 space-y-3">
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+237 6XX XX XX XX"
                  className="w-full rounded-xl border border-[var(--vibe-line-strong)] bg-[var(--vibe-bg)] px-4 py-3 text-sm text-[var(--vibe-fg)] placeholder:text-[var(--vibe-fg-subtle)] focus:border-[var(--vibe-accent)] focus:outline-none"
                />
                <button
                  onClick={handleSendCode}
                  disabled={startOtp.isPending}
                  className="vibe-cta w-full disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {startOtp.isPending ? 'Envoi…' : 'Recevoir le code WhatsApp'}
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="mt-3 text-sm leading-relaxed text-[var(--vibe-fg-muted)]">
                Entrez le code à 6 chiffres envoyé au {phone}.
              </p>
              <div className="mt-8 flex flex-col items-center space-y-4">
                <InputOTP maxLength={8} value={otp} onChange={(v) => setOtp(v)}>
                  <InputOTPGroup>
                    {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
                      <InputOTPSlot key={i} index={i} />
                    ))}
                  </InputOTPGroup>
                </InputOTP>
                <button
                  onClick={handleVerify}
                  disabled={otp.length < 8 || verifyOtp.isPending}
                  className="vibe-cta w-full disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {verifyOtp.isPending ? 'Vérification…' : 'Vérifier'}
                </button>
                <button
                  onClick={() => { setStep('phone'); setOtp(''); setError('') }}
                  className="text-xs text-[var(--vibe-fg-subtle)] hover:text-[var(--vibe-fg)]"
                >
                  ← Changer de numéro
                </button>
              </div>
            </>
          )}

          {error && (
            <p className="mt-4 text-center text-xs text-red-400">{error}</p>
          )}

          <p className="mt-6 text-center text-xs text-[var(--vibe-fg-subtle)]">
            Pas encore de compte ?{' '}
            <Link
              to="/sign-up"
              className="text-[var(--vibe-fg)] underline-offset-2 hover:underline"
            >
              S'inscrire
            </Link>
          </p>
        </div>

        <Link
          to="/"
          className="mt-6 text-xs text-[var(--vibe-fg-subtle)] hover:text-[var(--vibe-fg)]"
        >
          ← Retour à l'accueil
        </Link>
      </section>
    </VibeLayout>
  )
}

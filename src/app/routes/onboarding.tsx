import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { useAuraMutation } from '@/aura/client'
import { api } from '@/aura/_generated/api'

export const Route = createFileRoute('/onboarding')({ component: OnboardingPage })

function OnboardingPage() {
  const navigate = useNavigate()
  const [step, setStep] = useState(1)
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [bio, setBio] = useState('')
  const [locationLabel, setLocationLabel] = useState('')
  const [privacy, setPrivacy] = useState(false)
  const [dataProcessing, setDataProcessing] = useState(false)
  const [whatsappComms, setWhatsappComms] = useState(false)
  const [error, setError] = useState('')

  const setPasswordMut = useAuraMutation(api.auth['set-password'])
  const updateProfile = useAuraMutation(api.profiles.update)
  const setConsent = useAuraMutation(api.profiles['set-consent'], {
    onSuccess: () => navigate({ to: '/app' }),
  })

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-950 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-zinc-900 p-8">
        <p className="text-xs text-white/40">Étape {step}/3</p>
        <h1 className="mt-1 text-xl font-bold text-white">
          {step === 1 && 'Créez votre mot de passe'}
          {step === 2 && 'Votre profil'}
          {step === 3 && 'Consentements'}
        </h1>

        {step === 1 && (
          <form onSubmit={(e) => {
            e.preventDefault()
            if (password.length < 8) { setError('Minimum 8 caractères'); return }
            if (password !== confirmPassword) { setError('Les mots de passe ne correspondent pas'); return }
            setError('')
            setPasswordMut.mutate({ password }, { onSuccess: () => setStep(2) })
          }} className="mt-6 space-y-3">
            <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="Mot de passe (min 8 car.)" className="w-full rounded-lg border border-white/10 bg-zinc-800 px-3 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none" />
            <input value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} type="password" placeholder="Confirmer le mot de passe" className="w-full rounded-lg border border-white/10 bg-zinc-800 px-3 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none" />
            <button type="submit" disabled={setPasswordMut.isPending} className="w-full rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-black disabled:opacity-50">Suivant</button>
          </form>
        )}

        {step === 2 && (
          <form onSubmit={(e) => {
            e.preventDefault()
            if (!displayName.trim()) { setError('Nom requis'); return }
            setError('')
            updateProfile.mutate({ displayName, bio, locationLabel }, { onSuccess: () => setStep(3) })
          }} className="mt-6 space-y-3">
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Votre nom" className="w-full rounded-lg border border-white/10 bg-zinc-800 px-3 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none" />
            <textarea value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Bio (optionnel)" rows={2} className="w-full rounded-lg border border-white/10 bg-zinc-800 px-3 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none" />
            <input value={locationLabel} onChange={(e) => setLocationLabel(e.target.value)} placeholder="Ville (ex: Douala)" className="w-full rounded-lg border border-white/10 bg-zinc-800 px-3 py-2.5 text-sm text-white placeholder:text-white/30 focus:outline-none" />
            <button type="submit" disabled={updateProfile.isPending} className="w-full rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-black disabled:opacity-50">Suivant</button>
          </form>
        )}

        {step === 3 && (
          <form onSubmit={(e) => {
            e.preventDefault()
            setConsent.mutate({ privacy, dataProcessing, whatsappComms })
          }} className="mt-6 space-y-3">
            <label className="flex items-start gap-2 text-sm text-white/80">
              <input type="checkbox" checked={privacy} onChange={(e) => setPrivacy(e.target.checked)} className="mt-0.5" />
              J'accepte la politique de confidentialité
            </label>
            <label className="flex items-start gap-2 text-sm text-white/80">
              <input type="checkbox" checked={dataProcessing} onChange={(e) => setDataProcessing(e.target.checked)} className="mt-0.5" />
              J'accepte le traitement de mes données
            </label>
            <label className="flex items-start gap-2 text-sm text-white/80">
              <input type="checkbox" checked={whatsappComms} onChange={(e) => setWhatsappComms(e.target.checked)} className="mt-0.5" />
              J'accepte les communications WhatsApp
            </label>
            <button type="submit" disabled={!privacy || !dataProcessing || !whatsappComms || setConsent.isPending} className="w-full rounded-lg bg-white px-4 py-2.5 text-sm font-medium text-black disabled:opacity-50">
              Terminer
            </button>
          </form>
        )}

        {error && <p className="mt-4 text-center text-xs text-red-400">{error}</p>}
      </div>
    </div>
  )
}

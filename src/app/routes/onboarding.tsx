import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
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
  const updateProfile = useAuraMutation(api.profiles.upsert)
  const setConsent = useAuraMutation(api.users['consent-record'], {
    onSuccess: () => navigate({ to: '/app' }),
  })

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
          <p className="mt-2 text-sm text-slate-500 font-light">Etape {step}/3</p>
        </div>

        <div className="rounded-2xl bg-white/72 backdrop-blur border border-white p-6 shadow-card">
          {step === 1 && (
            <form onSubmit={(e) => {
              e.preventDefault()
              if (password.length < 8) { setError('Minimum 8 caracteres'); return }
              if (password !== confirmPassword) { setError('Ne correspondent pas'); return }
              setError('')
              setPasswordMut.mutate({ password }, { onSuccess: () => setStep(2) })
            }} className="space-y-4">
              <p className="text-sm font-medium text-slate-900">Creez votre mot de passe</p>
              <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" placeholder="Mot de passe (min 8)" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 shadow-inset-highlight focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
              <input value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} type="password" placeholder="Confirmer" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 shadow-inset-highlight focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
              {error && <p className="text-xs text-red-500">{error}</p>}
              <button type="submit" disabled={setPasswordMut.isPending} className="w-full rounded-full py-3 bg-gradient-to-b from-blue-500 to-blue-600 border border-blue-700 text-white text-sm font-medium shadow-btn-primary disabled:opacity-50">Suivant</button>
            </form>
          )}

          {step === 2 && (
            <form onSubmit={(e) => {
              e.preventDefault()
              if (!displayName.trim()) { setError('Nom requis'); return }
              setError('')
              updateProfile.mutate({ displayName, bio, locationLabel }, { onSuccess: () => setStep(3) })
            }} className="space-y-4">
              <p className="text-sm font-medium text-slate-900">Votre profil</p>
              <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Votre nom" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 shadow-inset-highlight focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
              <input value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Bio (optionnel)" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 shadow-inset-highlight focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
              <input value={locationLabel} onChange={(e) => setLocationLabel(e.target.value)} placeholder="Ville (ex: Douala)" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 shadow-inset-highlight focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
              {error && <p className="text-xs text-red-500">{error}</p>}
              <button type="submit" disabled={updateProfile.isPending} className="w-full rounded-full py-3 bg-gradient-to-b from-blue-500 to-blue-600 border border-blue-700 text-white text-sm font-medium shadow-btn-primary disabled:opacity-50">Suivant</button>
            </form>
          )}

          {step === 3 && (
            <form onSubmit={(e) => {
              e.preventDefault()
              setConsent.mutate({ privacy, dataProcessing, whatsappComms })
            }} className="space-y-4">
              <p className="text-sm font-medium text-slate-900">Consentements</p>
              <label className="flex items-start gap-2.5 text-xs text-slate-600">
                <input type="checkbox" checked={privacy} onChange={(e) => setPrivacy(e.target.checked)} className="mt-0.5 rounded" />
                J'accepte la politique de confidentialite
              </label>
              <label className="flex items-start gap-2.5 text-xs text-slate-600">
                <input type="checkbox" checked={dataProcessing} onChange={(e) => setDataProcessing(e.target.checked)} className="mt-0.5 rounded" />
                J'accepte le traitement de mes donnees
              </label>
              <label className="flex items-start gap-2.5 text-xs text-slate-600">
                <input type="checkbox" checked={whatsappComms} onChange={(e) => setWhatsappComms(e.target.checked)} className="mt-0.5 rounded" />
                J'accepte les communications WhatsApp
              </label>
              <button type="submit" disabled={!privacy || !dataProcessing || !whatsappComms || setConsent.isPending} className="w-full rounded-full py-3 bg-gradient-to-b from-blue-500 to-blue-600 border border-blue-700 text-white text-sm font-medium shadow-btn-primary disabled:opacity-50">
                Terminer
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}

import { createFileRoute, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import { useAuraMutation } from '@/aura/client'
import { api } from '@/aura/_generated/api'

export const Route = createFileRoute('/onboarding')({ component: OnboardingPage })

function OnboardingPage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [displayName, setDisplayName] = useState('')
  const [bio, setBio] = useState('')
  const [locationLabel, setLocationLabel] = useState('')
  const [language, setLanguage] = useState<'FR' | 'EN'>('FR')
  const [privacy, setPrivacy] = useState(false)
  const [dataProcessing, setDataProcessing] = useState(false)
  const [whatsappComms, setWhatsappComms] = useState(false)

  const updateProfile = useAuraMutation(api.profiles.update)
  const setLang = useAuraMutation(api.profiles['set-language'])
  const setConsent = useAuraMutation(api.profiles['set-consent'], {
    onSuccess: () => router.navigate({ to: '/app' }),
  })

  return (
    <div className="mx-auto max-w-md px-5 py-16">
      <h1 className="mb-8 text-2xl font-bold">Bienvenue sur Vibe</h1>

      {step === 1 && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            updateProfile.mutate({ displayName, bio, locationLabel }, { onSuccess: () => setStep(2) })
          }}
          className="space-y-4"
        >
          <label className="block">
            <span className="text-sm font-medium">Nom affiché</span>
            <input className="mt-1 block w-full rounded border px-3 py-2" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Bio</span>
            <textarea className="mt-1 block w-full rounded border px-3 py-2" rows={3} value={bio} onChange={(e) => setBio(e.target.value)} />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Localisation</span>
            <input className="mt-1 block w-full rounded border px-3 py-2" value={locationLabel} onChange={(e) => setLocationLabel(e.target.value)} />
          </label>
          <button type="submit" className="w-full rounded bg-black px-4 py-2 text-white" disabled={updateProfile.isPending}>
            Suivant
          </button>
        </form>
      )}

      {step === 2 && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            setLang.mutate({ language }, { onSuccess: () => setStep(3) })
          }}
          className="space-y-4"
        >
          <label className="block">
            <span className="text-sm font-medium">Langue préférée</span>
            <select className="mt-1 block w-full rounded border px-3 py-2" value={language} onChange={(e) => setLanguage(e.target.value as 'FR' | 'EN')}>
              <option value="FR">Français</option>
              <option value="EN">English</option>
            </select>
          </label>
          <button type="submit" className="w-full rounded bg-black px-4 py-2 text-white" disabled={setLang.isPending}>
            Suivant
          </button>
        </form>
      )}

      {step === 3 && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            setConsent.mutate({ privacy, dataProcessing, whatsappComms })
          }}
          className="space-y-4"
        >
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={privacy} onChange={(e) => setPrivacy(e.target.checked)} />
            <span className="text-sm">J'accepte la politique de confidentialité</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={dataProcessing} onChange={(e) => setDataProcessing(e.target.checked)} />
            <span className="text-sm">J'accepte le traitement de mes données</span>
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={whatsappComms} onChange={(e) => setWhatsappComms(e.target.checked)} />
            <span className="text-sm">J'accepte les communications WhatsApp</span>
          </label>
          <button
            type="submit"
            className="w-full rounded bg-black px-4 py-2 text-white disabled:opacity-50"
            disabled={!privacy || !dataProcessing || !whatsappComms || setConsent.isPending}
          >
            Terminer
          </button>
        </form>
      )}
    </div>
  )
}

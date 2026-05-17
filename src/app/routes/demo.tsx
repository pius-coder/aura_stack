import { createFileRoute, Link } from '@tanstack/react-router'
import { Button } from '@/aura/ui/button'
import { VibeIphoneMockup } from '@/aura/ui/vibe-iphone-mockup'

export const Route = createFileRoute('/demo')({ component: DemoPage })

function DemoPage() {
  return (
    <div className="mx-auto flex max-w-5xl flex-col items-center gap-8 px-4 py-16 md:flex-row md:gap-12">
      <div className="flex-1">
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Demo</p>
        <h1 className="mt-2 text-2xl font-black tracking-tight">
          Testez l'assistante avant de vous inscrire.
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Voici a quoi ressemble une conversation avec Orya, votre assistante Orya.
        </p>
        <div className="mt-5 flex gap-2">
          <Link to="/sign-up"><Button>Creer mon compte</Button></Link>
          <Link to="/"><Button variant="outline">Retour</Button></Link>
        </div>
      </div>
      <div className="shrink-0">
        <VibeIphoneMockup />
      </div>
    </div>
  )
}

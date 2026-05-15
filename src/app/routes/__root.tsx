import { HeadContent, Outlet, Scripts, createRootRoute } from '@tanstack/react-router'
import { AuraClientProvider } from '@/aura/client'
import { AuraBumpToaster } from '@/aura/ui'
import appCss from '../../styles.css?url'

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Vibe — Votre prestataire de confiance' },
    ],
    links: [{ rel: 'stylesheet', href: appCss }],
  }),
  component: RootLayout,
})

function RootLayout() {
  return (
    <html lang="fr" className="dark">
      <head>
        <HeadContent />
      </head>
      <body className="min-h-screen bg-zinc-950 font-sans text-white antialiased">
        <AuraClientProvider>
          <Outlet />
          <AuraBumpToaster />
        </AuraClientProvider>
        <Scripts />
      </body>
    </html>
  )
}

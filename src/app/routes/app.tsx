import { createFileRoute, Outlet, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/app')({
  beforeLoad: ({ context }) => {
    if (!(context as any).user) {
      throw redirect({ to: '/sign-in' })
    }
  },
  component: AppLayout,
})

function AppLayout() {
  return (
    <div className="flex min-h-screen">
      <aside className="w-56 border-r p-4">
        <p className="text-sm font-medium text-gray-500">Menu</p>
      </aside>
      <main className="flex-1 p-6">
        <Outlet />
      </main>
    </div>
  )
}

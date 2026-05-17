import { createFileRoute, Link, Outlet, redirect } from '@tanstack/react-router'
import { Separator } from '@/aura/ui/separator'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  Users,
  AlertTriangle,
  ChevronLeft,
} from 'lucide-react'

export const Route = createFileRoute('/admin')({
  beforeLoad: ({ context }) => {
    const c = context as any
    if (!c?.user?.isAdmin) throw redirect({ to: '/app' })
  },
  component: AdminLayout,
})

type AdminNavItem = {
  to: string
  label: string
  icon: typeof LayoutDashboard
  exact?: boolean
}

const ADMIN_NAV: AdminNavItem[] = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { to: '/admin/users', label: 'Utilisateurs', icon: Users },
  { to: '/admin/disputes', label: 'Litiges', icon: AlertTriangle },
]

function AdminLayout() {
  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="hidden w-56 flex-col border-r border-border bg-card md:flex">
        <div className="px-4 py-4">
          <p className="text-xs font-black uppercase tracking-wider text-foreground">
            Admin Orya
          </p>
        </div>
        <Separator />
        <nav className="flex flex-1 flex-col gap-0.5 p-2">
          {ADMIN_NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              activeOptions={{ exact: item.exact }}
              className={cn(
                'flex items-center gap-2 px-3 py-2 text-xs font-medium transition-colors',
                'text-muted-foreground hover:bg-muted hover:text-foreground',
                '[&.active]:bg-primary [&.active]:text-primary-foreground'
              )}
            >
              <item.icon className="h-4 w-4 shrink-0" />
              {item.label}
            </Link>
          ))}
        </nav>
        <Separator />
        <div className="p-2">
          <Link
            to="/app"
            className="flex items-center gap-2 px-3 py-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
            Retour app
          </Link>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto p-4 md:p-6">
        <Outlet />
      </main>

      {/* Mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card md:hidden">
        <div className="mx-auto flex max-w-md items-center justify-around px-1 py-1">
          {ADMIN_NAV.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              activeOptions={{ exact: item.exact }}
              className={cn(
                'flex flex-col items-center gap-0.5 px-2 py-1.5 text-[8px] font-bold uppercase tracking-wider transition-colors',
                'text-muted-foreground [&.active]:text-foreground'
              )}
            >
              <item.icon className="h-4 w-4" />
              <span>{item.label}</span>
            </Link>
          ))}
        </div>
      </nav>
    </div>
  )
}

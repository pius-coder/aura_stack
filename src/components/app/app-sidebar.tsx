import { Link, useLocation } from "@tanstack/react-router";
import { User, Briefcase, Users, MessageSquare, CreditCard, Settings, BadgeCheck } from "lucide-react";

interface AppSidebarProps {
  displayName: string | null;
  alias: string | null;
  isProvider: boolean;
  isVerified: boolean;
}

interface NavItem {
  to: string;
  label: string;
  icon: typeof Users;
  providerOnly?: boolean;
  exact?: boolean;
}

const NAV_LINKS: NavItem[] = [
  { to: "/app", label: "Accueil", icon: Users, exact: true },
  { to: "/app/profile", label: "Mon Profil", icon: User },
  { to: "/app/services", label: "Services", icon: Briefcase, providerOnly: true },
  { to: "/app/matches", label: "Matchs", icon: Users },
  { to: "/app/chat", label: "Conversations", icon: MessageSquare },
  { to: "/app/billing", label: "Abonnement", icon: CreditCard },
  { to: "/app/settings", label: "Paramètres", icon: Settings },
];

const BOTTOM_NAV: NavItem[] = [
  { to: "/app", label: "Accueil", icon: Users, exact: true },
  { to: "/app/matches", label: "Matchs", icon: Users },
  { to: "/app/chat", label: "Chat", icon: MessageSquare },
  { to: "/app/profile", label: "Profil", icon: User },
  { to: "/app/settings", label: "Options", icon: Settings },
];

export function AppSidebar({ displayName, alias, isProvider, isVerified }: AppSidebarProps) {
  const loc = useLocation();

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:flex md:flex-col md:w-64 md:fixed md:inset-y-0 md:border-r md:border-slate-200/60 md:bg-white/84 md:backdrop-blur-2xl">
        <div className="flex items-center gap-2 px-5 pt-6 pb-4">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-b from-blue-500 to-blue-600">
            <span className="text-xs font-bold text-white">O</span>
          </div>
          <span className="text-base font-black tracking-[-0.04em] text-slate-950">Orya</span>
        </div>

        <nav className="flex-1 px-3 py-2 space-y-0.5">
          {NAV_LINKS.map((item) => {
            if (item.providerOnly && !isProvider) return null;
            const active = item.exact
              ? loc.pathname === item.to
              : loc.pathname.startsWith(item.to) && (item.to === "/app" ? loc.pathname === "/app" : true);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                  active
                    ? "bg-gradient-to-b from-blue-500 to-blue-600 text-white shadow-sm"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="px-4 py-4 border-t border-slate-200/60">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-b from-blue-100 to-sky-100 ring-2 ring-white">
              <User className="h-4 w-4 text-blue-600" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900 truncate">
                {displayName || alias || "Utilisateur"}
              </p>
              <p className="flex items-center gap-1 text-[10px] text-slate-400">
                {isProvider ? "Prestataire" : "Membre"}
                {isVerified && <BadgeCheck className="h-2.5 w-2.5 text-blue-500" />}
              </p>
            </div>
          </div>
        </div>
      </aside>

      {/* Mobile bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 flex items-center justify-around border-t border-slate-200/60 bg-white/90 backdrop-blur-xl px-2 py-1.5 md:hidden">
        {BOTTOM_NAV.map((item) => {
          const active = item.exact
            ? loc.pathname === item.to
            : loc.pathname.startsWith(item.to);
          return (
            <Link
              key={item.to}
              to={item.to}
              className={`flex flex-col items-center gap-0.5 rounded-xl px-3 py-1.5 transition-colors ${
                active ? "text-blue-600" : "text-slate-400"
              }`}
            >
              <item.icon className="h-5 w-5" />
              <span className="text-[9px] font-medium">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}

import { Link } from "@tanstack/react-router";
import { X, User, Briefcase, Users, MessageSquare, Settings, BadgeCheck } from "lucide-react";

interface AppNavProps {
  open: boolean;
  onClose: () => void;
  displayName: string | null;
  alias: string | null;
  isProvider: boolean;
  isVerified: boolean;
}

const NAV_LINKS = [
  { to: "/app/profile", label: "Mon Profil", icon: User, providerOnly: false },
  { to: "/app/services", label: "Services", icon: Briefcase, providerOnly: true },
  { to: "/app/matches", label: "Matchs", icon: Users, providerOnly: false },
  { to: "/app/chat", label: "Conversations", icon: MessageSquare, providerOnly: false },
  { to: "/app/settings", label: "Paramètres", icon: Settings, providerOnly: false },
] as const;

export function AppNav({ open, onClose, displayName, alias, isProvider, isVerified }: AppNavProps) {
  return (
    <>
      {open && (
        <div className="fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

          <div className="relative ml-auto flex h-full w-72 max-w-[75vw] flex-col bg-white shadow-xl">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
              <span className="text-xs font-semibold text-slate-900">Menu</span>
              <button
                type="button"
                onClick={onClose}
                className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 transition-colors"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="px-4 py-4 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-b from-blue-100 to-sky-100 ring-2 ring-white">
                  <User className="h-5 w-5 text-blue-600" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-slate-900 truncate">
                    {displayName || alias || "Utilisateur"}
                  </p>
                  <p className="flex items-center gap-1 text-[10px] text-slate-400">
                    {isProvider ? "Prestataire" : "Membre"}
                    {isVerified && <BadgeCheck className="h-3 w-3 text-blue-500" />}
                  </p>
                </div>
              </div>
            </div>

            <nav className="flex-1 px-2 py-2 space-y-0.5">
              {NAV_LINKS.map((item) => {
                if (item.providerOnly && !isProvider) return null;
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    onClick={onClose}
                    className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-colors"
                  >
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            <div className="px-4 py-3 border-t border-slate-100">
              <Link
                to="/sign-in"
                onClick={onClose}
                className="block text-center rounded-full py-2 text-xs font-medium text-slate-400 hover:text-red-500 transition-colors"
              >
                Déconnexion
              </Link>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

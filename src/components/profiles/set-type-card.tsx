import { useAuraMutation } from "@/aura/client";
import { api } from "@/aura/_generated/api";
import { User, Briefcase } from "lucide-react";

export function SetTypeCard() {
  const setType = useAuraMutation(api.profiles["set-type"]);

  return (
    <div className="rounded-2xl bg-white/72 backdrop-blur border border-white shadow-card p-5">
      <h2 className="text-sm font-semibold text-slate-900 mb-1">Choisissez votre type de profil</h2>
      <p className="text-xs text-slate-500 font-light mb-4">
        Ce choix déterminera les fonctionnalités disponibles sur la plateforme.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => setType.mutate({ type: "standard" })}
          disabled={setType.isPending}
          className="rounded-xl border border-slate-200 bg-white p-4 text-left transition-all hover:border-blue-200 hover:shadow-sm hover:-translate-y-0.5 disabled:opacity-50"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-b from-blue-100 to-sky-100 mb-3">
            <User className="h-5 w-5 text-blue-600" />
          </div>
          <h3 className="text-sm font-medium text-slate-900">Membre</h3>
          <p className="mt-1 text-[10px] text-slate-500 font-light leading-relaxed">
            Recherchez des prestataires, envoyez des demandes de matching et échangez en chat anonyme.
          </p>
        </button>
        <button
          type="button"
          onClick={() => setType.mutate({ type: "prestataire" })}
          disabled={setType.isPending}
          className="rounded-xl border border-slate-200 bg-white p-4 text-left transition-all hover:border-blue-200 hover:shadow-sm hover:-translate-y-0.5 disabled:opacity-50"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-b from-amber-100 to-orange-100 mb-3">
            <Briefcase className="h-5 w-5 text-amber-600" />
          </div>
          <h3 className="text-sm font-medium text-slate-900">Prestataire</h3>
          <p className="mt-1 text-[10px] text-slate-500 font-light leading-relaxed">
            Proposez vos services, soyez trouvé par des clients et développez votre activité.
          </p>
        </button>
      </div>
    </div>
  );
}

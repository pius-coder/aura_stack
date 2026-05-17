import { useState } from "react";
import { useAuraQuery } from "@/aura/client";
import { api } from "@/aura/_generated/api";
import { User, MapPin, BadgeCheck, Edit3, ArrowLeft } from "lucide-react";
import { ProfileForm } from "./profile-form";
import { SetTypeCard } from "./set-type-card";

interface ProfileViewData {
  displayName: string | null;
  alias: string | null;
  bio: string | null;
  locationLabel: string | null;
  photoFileId: string | null;
  isProvider: boolean;
  isVerified: boolean;
  status: string;
}

interface ProfileViewProps {
  profile: ProfileViewData;
}

export function ProfileView({ profile }: ProfileViewProps) {
  const [editing, setEditing] = useState(false);

  const { data: photoData } = useAuraQuery(
    api.profiles["get-photo-url"],
    { input: { storageId: profile.photoFileId! }, enabled: !!profile.photoFileId }
  );

  const hasNoType = !profile.isProvider && !("isClient" in profile ? profile.isClient : false);

  if (editing) {
    return (
      <div className="p-4 space-y-4">
        <button
          type="button"
          onClick={() => setEditing(false)}
          className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Retour
        </button>
        <ProfileForm profile={profile} onDone={() => setEditing(false)} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-white/72 backdrop-blur border border-white shadow-card p-5">
        <div className="flex items-start gap-4">
          <div className="h-16 w-16 shrink-0 rounded-full bg-gradient-to-b from-blue-100 to-sky-100 flex items-center justify-center overflow-hidden ring-2 ring-white/80">
            {photoData?.url ? (
              <img src={photoData.url} alt="" className="h-full w-full object-cover" />
            ) : (
              <User className="h-7 w-7 text-slate-400" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="text-base font-semibold text-slate-900 truncate">
                {profile.displayName || profile.alias || "Utilisateur"}
              </h2>
              {profile.isVerified && (
                <BadgeCheck className="h-4 w-4 shrink-0 text-blue-500" />
              )}
            </div>
            <p className="text-xs font-medium text-slate-400 mt-0.5">
              {profile.isProvider ? "Prestataire" : "Membre"}
            </p>
            {profile.locationLabel && (
              <p className="flex items-center gap-1 text-xs text-slate-400 mt-1">
                <MapPin className="h-3 w-3" />
                {profile.locationLabel}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="shrink-0 rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
          >
            <Edit3 className="h-4 w-4" />
          </button>
        </div>
        {profile.bio && (
          <p className="mt-3 text-sm text-slate-500 font-light leading-relaxed">
            {profile.bio}
          </p>
        )}
      </div>

      {hasNoType && <SetTypeCard />}
    </div>
  );
}

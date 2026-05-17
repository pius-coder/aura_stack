import { useState, useRef } from "react";
import { useAuraMutation } from "@/aura/client";
import { api } from "@/aura/_generated/api";
import { Upload, X } from "lucide-react";

interface ProfileFormData {
  displayName: string | null;
  bio: string | null;
  locationLabel: string | null;
  photoFileId: string | null;
}

interface ProfileFormProps {
  profile: ProfileFormData;
  onDone: () => void;
}

export function ProfileForm({ profile, onDone }: ProfileFormProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [displayName, setDisplayName] = useState(profile.displayName || "");
  const [bio, setBio] = useState(profile.bio || "");
  const [locationLabel, setLocationLabel] = useState(profile.locationLabel || "");
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const upsert = useAuraMutation(api.profiles.upsert, {
    onSuccess: () => onDone(),
  });

  const uploadPhoto = useAuraMutation<{ file: File }, { fileId: string; url: string }>("profiles.upload-photo", {
    onSuccess: (data) => setPhotoUrl(data.url),
  });

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    uploadPhoto.mutate({ file });
    setUploading(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    upsert.mutate({
      displayName: displayName || undefined,
      bio: bio || undefined,
      locationLabel: locationLabel || undefined,
    });
  };

  const inputClass =
    "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 shadow-inset-highlight focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300";
  const labelClass = "text-xs font-medium text-slate-700";
  const fieldClass = "space-y-1.5";

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl bg-white/72 backdrop-blur border border-white shadow-card p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-slate-900">Modifier le profil</h3>
        <button type="button" onClick={onDone} className="rounded-full p-1 text-slate-400 hover:bg-slate-100 transition-colors">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className={fieldClass}>
        <label className={labelClass}>Photo</label>
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-full bg-gradient-to-b from-blue-100 to-sky-100 flex items-center justify-center overflow-hidden ring-2 ring-white/80">
            {photoUrl ? (
              <img src={photoUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              <Upload className="h-5 w-5 text-slate-400" />
            )}
          </div>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="rounded-full px-3 py-1.5 text-[10px] font-medium bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 transition-colors"
          >
            {uploading ? "Upload..." : "Changer"}
          </button>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={handleFile} className="hidden" />
        </div>
      </div>

      <div className={fieldClass}>
        <label className={labelClass}>Nom d'affichage</label>
        <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={80} placeholder="Votre nom" className={inputClass} />
      </div>

      <div className={fieldClass}>
        <label className={labelClass}>Bio</label>
        <textarea value={bio} onChange={(e) => setBio(e.target.value)} maxLength={1000} rows={3} placeholder="Parlez de vous..." className={inputClass + " resize-none"} />
      </div>

      <div className={fieldClass}>
        <label className={labelClass}>Localisation</label>
        <input value={locationLabel} onChange={(e) => setLocationLabel(e.target.value)} placeholder="Ville (ex: Douala)" className={inputClass} />
      </div>

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={upsert.isPending}
          className="flex-1 rounded-full py-2.5 bg-gradient-to-b from-blue-500 to-blue-600 border border-blue-700 text-white text-xs font-medium shadow-btn-primary hover:-translate-y-0.5 transition-all disabled:opacity-50"
        >
          {upsert.isPending ? "Sauvegarde..." : "Enregistrer"}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="rounded-full py-2.5 px-4 border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50 transition-colors"
        >
          Annuler
        </button>
      </div>
    </form>
  );
}

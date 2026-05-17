import { useState } from "react";
import { z } from "zod";
import { useNavigate } from "@tanstack/react-router";
import { useAuraMutation } from "@/aura/client";
import { api } from "@/aura/_generated/api";
import { ArrowRight } from "lucide-react";

const phoneSchema = z.string().regex(/^\+[1-9]\d{7,14}$/, "Numéro invalide.");

const signUpSchema = z.object({
  phoneE164: phoneSchema,
  email: z.string().email("Email invalide.").optional().or(z.literal("")),
  password: z
    .string()
    .min(12, "Minimum 12 caractères.")
    .regex(/[a-zA-Z]/, "Au moins une lettre.")
    .regex(/[0-9]/, "Au moins un chiffre.")
    .regex(/[^a-zA-Z0-9]/, "Au moins un caractère spécial."),
  displayName: z.string().max(80).optional().or(z.literal("")),
  consent: z.object({
    privacy: z.literal(true, {
      errorMap: () => ({ message: "Consentement requis." }),
    }),
    dataProcessing: z.literal(true, {
      errorMap: () => ({ message: "Consentement requis." }),
    }),
    whatsappComms: z.literal(true, {
      errorMap: () => ({ message: "Consentement requis." }),
    }),
  }),
});

type FormData = {
  phoneE164: string;
  email: string;
  password: string;
  displayName: string;
  consent: {
    privacy: boolean;
    dataProcessing: boolean;
    whatsappComms: boolean;
  };
};

function validate(client: FormData): Record<string, string> {
  const result = signUpSchema.safeParse(client);
  if (result.success) return {};
  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join(".");
    if (!errors[key]) errors[key] = issue.message;
  }
  return errors;
}

export function SignUpForm() {
  const navigate = useNavigate();
  const [form, setForm] = useState<FormData>({
    phoneE164: "",
    email: "",
    password: "",
    displayName: "",
    consent: { privacy: false, dataProcessing: false, whatsappComms: false },
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const register = useAuraMutation(api.users.register, {
    onSuccess: () => {
      navigate({ to: "/app" });
    },
    onError: (e) => setErrors({ form: e.message }),
  });

  const handleChange = (
    field: string,
    value:
      | string
      | boolean
      | { privacy: boolean; dataProcessing: boolean; whatsappComms: boolean },
  ) => {
    setForm((prev) => {
      if (typeof value === "object" && !Array.isArray(value)) {
        return { ...prev, consent: value as FormData["consent"] };
      }
      return { ...prev, [field]: value };
    });
    setErrors((prev) => {
      const next = { ...prev };
      delete next[field];
      return next;
    });
  };

  const formatPhone = (raw: string) => {
    const cleaned = raw.replace(/\s/g, "");
    if (cleaned.startsWith("+")) return cleaned;
    if (cleaned.startsWith("237")) return `+${cleaned}`;
    return `+237${cleaned}`;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const data = {
      ...form,
      phoneE164: formatPhone(form.phoneE164),
    };
    const fieldErrors = validate(data);
    if (Object.keys(fieldErrors).length > 0) {
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    register.mutate({
      phoneE164: data.phoneE164,
      email: data.email || undefined,
      password: form.password,
      displayName: form.displayName || undefined,
      consent: {
        privacy: form.consent.privacy as true,
        dataProcessing: form.consent.dataProcessing as true,
        whatsappComms: form.consent.whatsappComms as true,
      },
    });
  };

  const inputClass =
    "w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 shadow-inset-highlight focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300";
  const labelClass = "text-xs font-medium text-slate-700";
  const fieldClass = "space-y-1.5";
  const errorClass = "text-xs text-red-500 font-medium";

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className={fieldClass}>
        <label className={labelClass}>Téléphone</label>
        <div className="flex gap-2">
          <span className="flex items-center rounded-xl bg-slate-100 border border-slate-200 px-3 text-xs text-slate-500 shadow-inset-highlight">+237</span>
          <input
            value={form.phoneE164}
            onChange={(e) => handleChange("phoneE164", e.target.value)}
            placeholder="6 97 00 00 00"
            type="tel"
            autoComplete="tel"
            className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 shadow-inset-highlight focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-300"
          />
        </div>
        {errors.phoneE164 && <p className={errorClass}>{errors.phoneE164}</p>}
      </div>

      <div className={fieldClass}>
        <label className={labelClass}>Email (optionnel)</label>
        <input
          value={form.email}
          onChange={(e) => handleChange("email", e.target.value)}
          placeholder="vous@exemple.com"
          type="email"
          autoComplete="email"
          className={inputClass}
        />
        {errors.email && <p className={errorClass}>{errors.email}</p>}
      </div>

      <div className={fieldClass}>
        <label className={labelClass}>Mot de passe</label>
        <input
          value={form.password}
          onChange={(e) => handleChange("password", e.target.value)}
          placeholder="12+ caractères, lettre + chiffre + spécial"
          type="password"
          autoComplete="new-password"
          className={inputClass}
        />
        {errors.password && <p className={errorClass}>{errors.password}</p>}
      </div>

      <div className={fieldClass}>
        <label className={labelClass}>Nom d'affichage (optionnel)</label>
        <input
          value={form.displayName}
          onChange={(e) => handleChange("displayName", e.target.value)}
          placeholder="Votre nom"
          type="text"
          maxLength={80}
          className={inputClass}
        />
      </div>

      <div className="space-y-2 rounded-sm bg-slate-50 border border-slate-200 px-3 py-3">
        <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">
          Consentements
        </p>
        {(
          [
            { key: "privacy", label: "J'accepte la politique de confidentialité" },
            { key: "dataProcessing", label: "J'accepte le traitement de mes données" },
            { key: "whatsappComms", label: "J'accepte de recevoir des communications WhatsApp" },
          ] as const
        ).map(({ key, label }) => (
          <label key={key} className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={form.consent[key]}
              onChange={() =>
                handleChange("consent", {
                  ...form.consent,
                  [key]: !form.consent[key],
                })
              }
              className="mt-0.5 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500/20"
            />
            <span className="text-xs text-slate-600 font-light">{label}</span>
          </label>
        ))}
        {errors["consent.privacy"] && (
          <p className={errorClass}>{errors["consent.privacy"]}</p>
        )}
      </div>

      {errors.form && <p className={errorClass}>{errors.form}</p>}

      <button
        type="submit"
        disabled={register.isPending}
        className="w-full inline-flex items-center justify-center gap-2 rounded-full py-3 bg-gradient-to-b from-blue-500 to-blue-600 border border-blue-700 text-white text-sm font-medium shadow-btn-primary hover:-translate-y-0.5 transition-all disabled:opacity-50"
      >
        {register.isPending ? "Création du compte..." : "Créer mon compte"}
        <ArrowRight className="h-3.5 w-3.5" />
      </button>
    </form>
  );
}

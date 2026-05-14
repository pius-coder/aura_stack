"use client";

import * as React from "react";
import { countries } from "@/lib/countries";
import { cn } from "@/lib/utils";

interface CountryPhoneSelectProps {
  value?: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

const PRIORITY_DIAL_CODES = [
  { code: "+225", name: "Côte d'Ivoire" },
  { code: "+221", name: "Sénégal" },
  { code: "+233", name: "Ghana" },
  { code: "+229", name: "Bénin" },
  { code: "+226", name: "Burkina Faso" },
  { code: "+228", name: "Togo" },
  { code: "+237", name: "Cameroun" },
  { code: "+242", name: "Congo" },
  { code: "+243", name: "RDC" },
  { code: "+241", name: "Gabon" },
];

export function CountryPhoneSelect({
  value,
  onChange,
  disabled,
}: CountryPhoneSelectProps) {
  const [mounted, setMounted] = React.useState(false);
  const initialized = React.useRef(false);

  React.useEffect(() => {
    setMounted(true);
  }, []);

  React.useEffect(() => {
    if (initialized.current || !mounted || value) return;

    const detected = detectCountryFromBrowser();
    if (detected) {
      const country = countries.find((c) => c.code === detected);
      if (country) {
        initialized.current = true;
        onChange(country.dialCode);
        return;
      }
    }

    // Default: Côte d'Ivoire
    const defaultCountry = countries.find((c) => c.dialCode === "+225");
    if (defaultCountry) {
      initialized.current = true;
      onChange(defaultCountry.dialCode);
    }
  }, [mounted, value, onChange]);

  const prioritized = React.useMemo(() => {
    const prioritySet = new Set(PRIORITY_DIAL_CODES.map((p) => p.code));
    const priority = countries.filter((c) => prioritySet.has(c.dialCode));
    const rest = countries.filter((c) => !prioritySet.has(c.dialCode)).sort((a, b) => a.name.localeCompare(b.name));
    return [...priority, ...rest];
  }, []);

  return (
    <select
      value={value || ""}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className={cn(
        "flex h-7 w-full items-center justify-between rounded-md border border-input bg-input/50 px-2 py-0 text-xs transition-all",
        "focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30",
        "disabled:pointer-events-none disabled:opacity-50",
        !value && "text-muted-foreground",
      )}
    >
      {!value && <option value="" disabled>Sélectionner un pays...</option>}
      {prioritized.map((country) => (
        <option key={country.code} value={country.dialCode}>
          {country.flag} {country.name} ({country.dialCode})
        </option>
      ))}
    </select>
  );
}

function detectCountryFromBrowser(): string | null {
  try {
    const locale = Intl.DateTimeFormat().resolvedOptions().locale;
    if (locale) {
      const parts = locale.split("-");
      if (parts.length >= 2) {
        const candidate = parts[parts.length - 1].toUpperCase();
        if (candidate.length === 2 && countries.find((c) => c.code === candidate)) {
          return candidate;
        }
      }
    }

    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz) {
      const africaMatch = tz.match(/^Africa\/(\w+)/);
      if (africaMatch) {
        const tzMap: Record<string, string> = {
          Abidjan: "CI", Accra: "GH", Addis_Ababa: "ET",
          Algiers: "DZ", Bamako: "ML", Bangui: "CF",
          Banjul: "GM", Bissau: "GW", Brazzaville: "CG",
          Bujumbura: "BI", Cairo: "EG", Casablanca: "MA",
          Conakry: "GN", Dakar: "SN", Dar_es_Salaam: "TZ",
          Djibouti: "DJ", Freetown: "SL", Gaborone: "BW",
          Harare: "ZW", Johannesburg: "ZA", Juba: "SS",
          Kampala: "UG", Khartoum: "SD", Kigali: "RW",
          Kinshasa: "CD", Lagos: "NG", Libreville: "GA",
          Lilongwe: "MW", Lome: "TG", Luanda: "AO",
          Lusaka: "ZM", Malabo: "GQ", Maputo: "MZ",
          Maseru: "LS", Mogadishu: "SO", Monrovia: "LR",
          Nairobi: "KE", Ndjamena: "TD", Niamey: "NE",
          Nouakchott: "MR", Ouagadougou: "BF", PortoNovo: "BJ",
          Sao_Tome: "ST", Tripoli: "LY", Tunis: "TN",
          Windhoek: "NA", Yaounde: "CM",
        };
        return tzMap[africaMatch[1]] || null;
      }
    }
  } catch {
    // ignore
  }
  return null;
}

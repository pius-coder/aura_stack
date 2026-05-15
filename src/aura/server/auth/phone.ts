

import { parsePhoneNumberFromString } from "libphonenumber-js";
import { AuraError } from "@/aura/core/errors";

export interface NormalizedPhone {
  countryCode: string;
  nationalNumber: string;
  phoneE164: string;
}

export function normalizePhone(input: { countryCode: string; phoneNumber: string }): NormalizedPhone {
  const countryCode = input.countryCode.trim().replace(/\s+/g, "");
  const phoneNumber = input.phoneNumber.trim().replace(/[\s().-]/g, "");
  const prefixedCountryCode = countryCode.startsWith("+") ? countryCode : `+${countryCode}`;
  const parsed = parsePhoneNumberFromString(`${prefixedCountryCode}${phoneNumber}`);

  if (!parsed || !parsed.isValid()) {
    throw new AuraError("VALIDATION_ERROR", "Le numéro de téléphone est invalide.", {
      fieldErrors: {
        phoneNumber: ["Le numéro de téléphone est invalide."],
      },
    });
  }

  return {
    countryCode: `+${parsed.countryCallingCode}`,
    nationalNumber: parsed.nationalNumber,
    phoneE164: parsed.number,
  };
}

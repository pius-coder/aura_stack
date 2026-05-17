const TUTOIEMENT_REGEX = /\b(tu |toi |ton |ta |tes |t')/i;
export function checkPersonaCompliance(text: string): boolean {
  return !TUTOIEMENT_REGEX.test(text);
}
export const FALLBACK_RESPONSE = "Je vous prie de m'excuser, je rencontre une difficulté technique. Veuillez réessayer dans un instant.";

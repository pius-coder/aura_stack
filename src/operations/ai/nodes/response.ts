const FORBIDDEN_PATTERNS = [
  /\btu\b/i,
  /\btoi\b/i,
  /\bton\b/i,
  /\bta\b/i,
  /\btes\b/i,
  /\bt['’]/i,
  /\b(yo|hey|wesh|coucou|cc|btw|gonna|wanna)\b/i,
  /[\u{1F300}-\u{1FAFF}].*[\u{1F300}-\u{1FAFF}]/u,
  /\+?\d{10,}/,
  /[\w.+-]+@[\w-]+\.[\w.-]+/,
  /\b(rue|avenue|boulevard|quartier)\s+\w+/i,
];

export function getPersonaViolations(text: string): string[] {
  const violations: string[] = [];
  for (const pattern of FORBIDDEN_PATTERNS) {
    if (pattern.test(text)) {
      violations.push(pattern.source);
    }
  }
  return violations;
}

export function checkPersonaCompliance(text: string): boolean {
  return getPersonaViolations(text).length === 0;
}

export const FALLBACK_RESPONSE =
  "Je vous prie de m'excuser, je rencontre une difficulte technique. Veuillez reessayer dans un instant.";

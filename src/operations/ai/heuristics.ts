import type {
  OryaExtractionPayload,
  OryaIntent,
} from "./orya-contracts";

const LOCATION_PATTERNS = [
  "douala",
  "yaounde",
  "yaoundé",
  "buea",
  "bamenda",
  "garoua",
  "kribi",
  "limbe",
  "bonaberi",
  "akwa",
];

const SKILL_PATTERNS: Array<{ pattern: RegExp; skill: string }> = [
  { pattern: /\bplomb/i, skill: "plomberie" },
  { pattern: /\belectri/i, skill: "electricite" },
  { pattern: /\bmenag|menage|clean/i, skill: "menage" },
  { pattern: /\bgraph|design/i, skill: "design graphique" },
  { pattern: /\bdev|developpeur|developer|site web/i, skill: "developpement web" },
  { pattern: /\bcoif|beaut|maquill/i, skill: "beaute" },
  { pattern: /\bcoutur|tailleur|mode/i, skill: "couture" },
  { pattern: /\bphoto|video/i, skill: "photo video" },
  { pattern: /\btransport|chauffeur|driver/i, skill: "transport" },
  { pattern: /\btraiteur|cuisine|cook/i, skill: "restauration" },
];

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

export function detectSelectionNumber(
  text: string,
  maxRank: number,
): number | null {
  if (maxRank <= 0) return null;
  const match = text.match(/(?:^|\D)([1-9])(?:\D|$)/);
  if (!match) return null;
  const rank = Number(match[1]);
  if (!Number.isInteger(rank) || rank < 1 || rank > maxRank) return null;
  return rank;
}

export function extractConstraintsHeuristically(
  text: string,
): OryaExtractionPayload {
  const lower = text.toLowerCase();
  const skills = unique(
    SKILL_PATTERNS.filter(({ pattern }) => pattern.test(lower)).map(
      ({ skill }) => skill,
    ),
  );

  const location = LOCATION_PATTERNS.find((candidate) =>
    lower.includes(candidate),
  );

  const budgetMatch = lower.match(/(\d[\d\s]{2,})\s*(xaf|fcfa)/i);
  const budgetMaxXaf = budgetMatch
    ? Number(budgetMatch[1].replace(/\s+/g, ""))
    : undefined;

  const needs: string[] = [];
  if (/\b(cherche|besoin|recherche|find|need|looking for)\b/i.test(text)) {
    needs.push(...skills);
  }

  return {
    skills,
    needs: unique(needs),
    location,
    industry:
      /\bstartup|entreprise|business|ngo|association\b/i.test(text)
        ? "business"
        : undefined,
    budgetMaxXaf,
    confidence:
      skills.length > 0 || location || budgetMaxXaf || needs.length > 0
        ? 0.72
        : 0.2,
  };
}

export function detectIntentHeuristically(args: {
  text: string;
  hasSelectionContext?: boolean;
}): {
  intent: OryaIntent;
  confidence: number;
  constraints?: Partial<OryaExtractionPayload>;
} {
  const lower = args.text.toLowerCase();
  const constraints = extractConstraintsHeuristically(args.text);

  if (args.hasSelectionContext && detectSelectionNumber(args.text, 5)) {
    return { intent: "selection", confidence: 0.95 };
  }

  if (/\b(profile|profil|service|settings|paramet|compte|account)\b/i.test(lower)) {
    return { intent: "account", confidence: 0.8 };
  }

  if (/\b(help|aide|comment|how)\b/i.test(lower)) {
    return { intent: "help", confidence: 0.7 };
  }

  if (
    /\b(connexion|contact|reseau|network|cofounder|partner|partenaire)\b/i.test(
      lower,
    )
  ) {
    return {
      intent: "search_connection",
      confidence: 0.82,
      constraints,
    };
  }

  if (
    /\b(cherche|besoin|recherche|trouver|find|need|looking for|looking)\b/i.test(
      lower,
    ) &&
    (constraints.skills.length > 0 || constraints.location || /\bprestataire|provider|artisan|service\b/i.test(lower))
  ) {
    return {
      intent: "search_provider",
      confidence: 0.88,
      constraints,
    };
  }

  return { intent: "chat", confidence: 0.55 };
}

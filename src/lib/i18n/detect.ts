export type DetectedLanguage = "FR" | "EN" | "UNKNOWN";

const FR_TERMS = [
  /\b(bonjour|salut|bonsoir)\b/i,
  /\b(merci|svp|stp|s'il vous plaît)\b/i,
  /\b(je\s+suis|je\s+veux|je\s+cherche|j'ai\s+besoin)\b/i,
  /\b(oui|non|d'accord|peut-être)\b/i,
  /\b(vous|votre|vos|chez|pour|dans|avec)\b/i,
  /\b(trouver|cherche|besoin|aide|recherche)\b/i,
  /\b(combien|prix|tarif|quartier|ville|douala|yaoundé)\b/i,
  /[éèêëàâîïôûùç]/,
];

const EN_TERMS = [
  /\b(hello|hi|hey|thanks|thank)\b/i,
  /\b(please|yes|no|okay|sure|alright)\b/i,
  /\b(i'm|i\s+am|i\s+want|i\s+need|i\s+looking|i'm\s+looking)\b/i,
  /\b(can\s+you|could\s+you|would\s+you)\b/i,
  /\b(help|find|search|looking|need|want)\b/i,
  /\b(where|how|what|which|who|why)\b/i,
  /\b(price|cost|how\s+much|tell\s+me)\b/i,
];

export function detectLanguage(text: string, threshold = 0.2): DetectedLanguage {
  const trimmed = text.trim().slice(0, 500);
  if (trimmed.length < 3) return "UNKNOWN";

  const frHits = FR_TERMS.filter((p) => p.test(trimmed)).length;
  const enHits = EN_TERMS.filter((p) => p.test(trimmed)).length;

  const frScore = frHits / FR_TERMS.length;
  const enScore = enHits / EN_TERMS.length;

  const max = Math.max(frScore, enScore);
  if (max < threshold) return "UNKNOWN";
  return frScore >= enScore ? "FR" : "EN";
}

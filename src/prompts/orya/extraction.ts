export function buildExtractionPrompt(
  text: string,
  contextSummary: string,
  language: "FR" | "EN",
) {
  const languageHint =
    language === "EN"
      ? "Respond with valid JSON only."
      : "Repondez uniquement avec un JSON valide.";

  return [
    languageHint,
    "Extract what the user is looking for or offering from their message.",
    'Return the shape: {"skills":[],"needs":[],"location":"","industry":"","budgetMaxXaf":0,"confidence":0.0}.',
    '"skills" = what the user can do or knows.',
    '"needs" = what the user is looking for.',
    '"location" = where they are or where they need the person to be.',
    "Do not invent any phone number, email, or exact address.",
    "Use concise normalized labels.",
    `Context summary:\n${contextSummary}`,
    `Message: """${text}"""`,
  ].join("\n");
}

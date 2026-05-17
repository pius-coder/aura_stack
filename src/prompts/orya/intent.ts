export function buildIntentPrompt(text: string, language: "FR" | "EN") {
  const languageHint =
    language === "EN"
      ? "The user is likely speaking English."
      : "L'utilisateur parle probablement francais.";

  return [
    languageHint,
    "Classify the user's intent and return only valid JSON.",
    'Allowed intents: "chat", "search_provider", "search_connection", "account", "help".',
    '"search_provider" = asking for someone who does a job or provides a service.',
    '"search_connection" = asking for a person to connect with (collaboration, meetup, networking).',
    '"help" = asking how the platform works or what to do next.',
    '"account" = talking about their own profile, settings, or account.',
    '"chat" = anything else — casual talk, greetings, sharing info about themselves, etc.',
    'Return the shape: {"intent": "...", "confidence": 0.0, "constraints": {"skills": [], "location": "", "industry": "", "budgetMaxXaf": 0}}.',
    "Only include constraints that are explicitly stated or strongly implied.",
    `Message: """${text}"""`,
  ].join("\n");
}

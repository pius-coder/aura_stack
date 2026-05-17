import type {
  OryaExtractionPayload,
  OryaMatchPresentation,
} from "@/operations/ai/orya-contracts";
import { buildLanguageInstruction } from "./persona";

export function buildReplyPrompt(args: {
  language: "FR" | "EN";
  contextSummary: string;
  userMessage: string;
}) {
  return [
    buildLanguageInstruction(args.language),
    "Respond naturally as yourself. Be concise. Do not sound like an assistant or a guide.",
    `Context:\n${args.contextSummary}`,
    `User message: """${args.userMessage}"""`,
  ].join("\n\n");
}

export function buildClarificationReply(
  language: "FR" | "EN",
  missing: string[],
) {
  if (language === "EN") {
    return `I can help with that. Please clarify ${missing.join(" and ")} so I can narrow the search.`;
  }
  return `Je peux vous aider. Pour affiner la recherche, pourriez-vous preciser ${missing.join(" et ")} ?`;
}

export function buildMatchPresentationReply(args: {
  language: "FR" | "EN";
  query: string;
  matches: OryaMatchPresentation[];
  extraction?: OryaExtractionPayload;
}) {
  const intro =
    args.language === "EN"
      ? `I found a few profiles for "${args.query}". Reply with the number of the person you want me to contact for you.`
      : `J'ai trouve quelques profils pour "${args.query}". Repondez avec le numero de la personne que vous souhaitez contacter.`;

  const lines = [intro];
  if (args.extraction?.location) {
    lines.push(
      args.language === "EN"
        ? `Area: ${args.extraction.location}`
        : `Zone: ${args.extraction.location}`,
    );
  }

  for (const match of args.matches) {
    lines.push(`${match.rank}. ${match.alias} - ${match.summary}`);
    lines.push(
      args.language === "EN"
        ? `Reason: ${match.reason}`
        : `Pourquoi: ${match.reason}`,
    );
  }

  return lines.join("\n");
}

export function buildSelectionConfirmationReply(
  language: "FR" | "EN",
  alias: string,
) {
  if (language === "EN") {
    return `Understood. I have sent a match request to ${alias}. I will let you know as soon as the person responds.`;
  }
  return `C'est note. J'ai envoye une demande de mise en relation a ${alias}. Je vous informerai des que cette personne repondra.`;
}

export function buildSelectionRetryReply(
  language: "FR" | "EN",
  maxRank: number,
) {
  if (language === "EN") {
    return `Please reply with a number between 1 and ${maxRank}.`;
  }
  return `Merci de repondre avec un numero entre 1 et ${maxRank}.`;
}

export function buildGuardrailRewritePrompt(
  language: "FR" | "EN",
  reply: string,
  reason: string,
) {
  const instruction =
    language === "EN"
      ? "Rewrite this reply so it sounds natural and warm but stays safe — no privacy leaks, no over-familiarity. Do not sound like a chatbot fixing itself."
      : "Reformulez cette reponse pour qu'elle reste naturelle et chaleureuse mais sure — pas de fuite de donnees privees, pas de familiarite excessive. Ne donnez pas l'impression qu'un chatbot se corrige.";

  return `${instruction}\nReason: ${reason}\nReply: """${reply}"""`;
}

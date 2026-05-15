export const translations: Record<string, Record<"FR" | "EN", string>> = {
  "match.new_request": {
    FR: "Vous avez recu une nouvelle demande de mise en relation. Connectez-vous pour repondre.",
    EN: "You have a new match request. Log in to respond.",
  },
  "match.accepted": {
    FR: "Votre demande de mise en relation a ete acceptee ! Vous pouvez maintenant echanger.",
    EN: "Your match request has been accepted! You can now chat.",
  },
  "match.refused": {
    FR: "Votre demande de mise en relation a ete declinee.",
    EN: "Your match request has been declined.",
  },
  "message.new": {
    FR: "Nouveau message dans votre conversation Orya. Ouvrez le tableau de bord pour lire.",
    EN: "New message in your Orya conversation. Open the dashboard to read.",
  },
  "payment.success": {
    FR: "Votre paiement a ete confirme. Votre avantage est desormais actif.",
    EN: "Your payment has been confirmed. Your benefit is now active.",
  },
  "warning.received": {
    FR: "Vous avez recu un avertissement sur Orya. Veuillez consulter votre tableau de bord.",
    EN: "You have received a warning on Orya. Please check your dashboard.",
  },
  "account.suspended": {
    FR: "Votre compte Orya a ete suspendu. Contactez le support pour plus d'informations.",
    EN: "Your Orya account has been suspended. Contact support for more information.",
  },
};

export function t(key: string, lang: "FR" | "EN"): string {
  return translations[key]?.[lang] ?? translations[key]?.FR ?? key;
}

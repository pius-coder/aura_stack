export interface AuthChallengeResult {
  challengeId: string;
  phoneE164: string;
  expiresAt: string;
}

export interface AuthUserSafe {
  id: string;
  phoneE164: string;
  phoneVerifiedAt: string | null;
  displayName: string | null;
  businessName: string | null;
  email: string | null;
  isAdmin: boolean;
  countryId: string | null;
  currencyCode: string | null;
  onboardingCompleted: boolean;
  whatsappChallenge: boolean;
  hadWhatsapp: boolean | null;
}

export interface AuthSessionResult {
  user: AuthUserSafe;
}

export interface AuthSessionListItem {
  id: string;
  expiresAt: string;
  lastUsedAt: string;
  createdAt: string;
  current: boolean;
}

export interface AuthSessionListResult {
  sessions: AuthSessionListItem[];
}

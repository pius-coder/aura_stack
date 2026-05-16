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
  email: string | null;
  isAdmin: boolean;
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

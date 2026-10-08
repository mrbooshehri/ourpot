export type PublicUser = { id: string; email: string };
export type SessionView = { id: string; createdAt: Date; lastUsedAt: Date; expiresAt: Date; userAgent: string; signInMethod: string };
export type SessionIssue = { token: string; session: SessionView };
export type SessionPrincipal = { userId: string; sessionId: string; recentAuthAt: Date | null };
export type LoginResult = { kind: 'session'; issue: SessionIssue } | { kind: 'mfa_required'; pendingToken: string };
export type PasskeyView = { id: string; name: string; createdAt: Date; lastUsedAt: Date | null };

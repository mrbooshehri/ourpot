export type AppConfig = Readonly<{
  environment: 'development' | 'test' | 'production';
  port: number;
  databaseUrl: string;
  publicOrigin: string;
  rpId: string;
  totpEncryptionKey: string | null;
  allowInsecureLocalhostCookie: boolean;
}>;

export function loadConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  const environment = env.NODE_ENV ?? 'development';
  if (environment !== 'development' && environment !== 'test' && environment !== 'production') {
    throw new Error('NODE_ENV must be development, test, or production');
  }
  const port = Number(env.PORT ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be a valid TCP port');
  }
  const publicOrigin = env.PUBLIC_ORIGIN ?? `http://localhost:${port}`;
  let origin: URL;
  try {
    origin = new URL(publicOrigin);
  } catch {
    throw new Error('PUBLIC_ORIGIN must be a valid origin');
  }
  if (origin.origin !== publicOrigin || (origin.protocol !== 'https:' && origin.protocol !== 'http:')) {
    throw new Error('PUBLIC_ORIGIN must be an HTTP(S) origin without a path');
  }
  const rpId = env.WEBAUTHN_RP_ID ?? origin.hostname;
  if (origin.hostname !== rpId && !origin.hostname.endsWith(`.${rpId}`)) {
    throw new Error('WEBAUTHN_RP_ID must match the public origin host or its parent domain');
  }
  const totpEncryptionKey = env.TOTP_ENCRYPTION_KEY ?? null;
  if (totpEncryptionKey && !/^[0-9a-fA-F]{64}$/.test(totpEncryptionKey)) {
    throw new Error('TOTP_ENCRYPTION_KEY must be 32 bytes encoded as 64 hex characters');
  }
  const allowInsecureLocalhostCookie = env.AUTH_ALLOW_INSECURE_LOCALHOST === 'true';
  if (allowInsecureLocalhostCookie && (origin.hostname !== 'localhost' || environment === 'production')) {
    throw new Error('Insecure auth cookies are allowed only on development localhost');
  }
  if (origin.protocol === 'http:' && !allowInsecureLocalhostCookie) {
    throw new Error('HTTP authentication requires explicit localhost development mode');
  }
  if (environment === 'production' && (origin.protocol !== 'https:' || !totpEncryptionKey)) {
    throw new Error('Production authentication requires HTTPS PUBLIC_ORIGIN and TOTP_ENCRYPTION_KEY');
  }
  return {
    environment,
    port,
    databaseUrl: env.DATABASE_URL ?? 'postgresql://localhost/ourpot',
    publicOrigin,
    rpId,
    totpEncryptionKey,
    allowInsecureLocalhostCookie,
  };
}

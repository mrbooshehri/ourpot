import type { AppConfig } from '../config';

export function assertMutationAllowed(request: Request, config: AppConfig): void {
  if (request.method === 'GET' || request.method === 'HEAD') return;
  if (request.headers.get('origin') !== config.publicOrigin || request.headers.get('x-ourpot-request') !== '1') {
    throw new Error('Cross-origin request denied');
  }
  if (request.body && request.headers.get('content-type')?.split(';')[0] !== 'application/json') {
    throw new Error('JSON request required');
  }
}

export function sessionToken(request: Request): string | null {
  return cookieValue(request, 'ourpot_session');
}

export function pendingToken(request: Request): string | null {
  return cookieValue(request, 'ourpot_pending');
}

export function passkeyLoginToken(request: Request): string | null {
  return cookieValue(request, 'ourpot_passkey_login');
}

export function passkeyRegistrationToken(request: Request): string | null {
  return cookieValue(request, 'ourpot_passkey_register');
}

export function passkeyReauthenticationToken(request: Request): string | null {
  return cookieValue(request, 'ourpot_passkey_reauth');
}

function cookieValue(request: Request, wanted: string): string | null {
  const raw = request.headers.get('cookie') ?? '';
  for (const part of raw.split(';')) {
    const [name, value] = part.trim().split('=', 2);
    if (name === wanted) return value ?? null;
  }
  return null;
}

export function sessionCookie(token: string, config: AppConfig): string {
  const secure = config.publicOrigin.startsWith('https:') ? '; Secure' : '';
  return `ourpot_session=${token}; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000${secure}`;
}

export function clearSessionCookie(config: AppConfig): string {
  const secure = config.publicOrigin.startsWith('https:') ? '; Secure' : '';
  return `ourpot_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`;
}

export function pendingCookie(token: string, config: AppConfig): string {
  const secure = config.publicOrigin.startsWith('https:') ? '; Secure' : '';
  return `ourpot_pending=${token}; HttpOnly; SameSite=Lax; Path=/api/auth; Max-Age=300${secure}`;
}

export function clearPendingCookie(config: AppConfig): string {
  const secure = config.publicOrigin.startsWith('https:') ? '; Secure' : '';
  return `ourpot_pending=; HttpOnly; SameSite=Lax; Path=/api/auth; Max-Age=0${secure}`;
}

export function passkeyChallengeCookie(name: 'ourpot_passkey_login' | 'ourpot_passkey_register' | 'ourpot_passkey_reauth', token: string, config: AppConfig): string {
  const secure = config.publicOrigin.startsWith('https:') ? '; Secure' : '';
  const path = name === 'ourpot_passkey_login' ? '/api/auth/passkey/login' : name === 'ourpot_passkey_reauth' ? '/api/auth/passkey/reauthenticate' : '/api/settings/passkeys';
  return `${name}=${token}; HttpOnly; SameSite=Lax; Path=${path}; Max-Age=300${secure}`;
}

import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type WebAuthnCredential,
} from '@simplewebauthn/server';
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server';

export async function registrationOptions(input: { rpId: string; email: string; userId: string; excludeCredentials: Array<{ id: string; transports?: string[] }> }) {
  return generateRegistrationOptions({
    rpName: 'Ourpot', rpID: input.rpId, userName: input.email, userID: Buffer.from(input.userId, 'utf8'),
    attestationType: 'none',
    authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
    excludeCredentials: input.excludeCredentials,
  });
}

export async function verifyRegistration(input: { response: RegistrationResponseJSON; challenge: string; origin: string; rpId: string }) {
  return verifyRegistrationResponse({
    response: input.response, expectedChallenge: input.challenge, expectedOrigin: input.origin,
    expectedRPID: input.rpId, requireUserVerification: true,
  });
}

export async function authenticationOptions(rpId: string, allowCredentials: Array<{ id: string; transports?: string[] }> = []) {
  return generateAuthenticationOptions({ rpID: rpId, userVerification: 'required', allowCredentials });
}

export async function verifyAuthentication(input: { response: AuthenticationResponseJSON; challenge: string; origin: string; rpId: string; credential: WebAuthnCredential }) {
  return verifyAuthenticationResponse({
    response: input.response, expectedChallenge: input.challenge, expectedOrigin: input.origin,
    expectedRPID: input.rpId, credential: input.credential, requireUserVerification: true,
  });
}

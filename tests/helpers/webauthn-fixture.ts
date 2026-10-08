import { createHash, generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import { isoCBOR } from '@simplewebauthn/server/helpers';
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server';

const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64url');
const sha256 = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest();

export function makeAuthenticator(rpId = 'localhost') {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = publicKey.export({ format: 'jwk' });
  if (!jwk.x || !jwk.y) throw new Error('Missing JWK coordinates');
  const credentialId = randomBytes(32);
  const id = b64(credentialId);
  const cose = isoCBOR.encode(new Map<number, number | Uint8Array>([
    [1, 2], [3, -7], [-1, 1], [-2, Buffer.from(jwk.x, 'base64url')], [-3, Buffer.from(jwk.y, 'base64url')],
  ]));
  const counter = (value: number) => { const bytes = Buffer.alloc(4); bytes.writeUInt32BE(value); return bytes; };
  const baseData = (flags: number, value: number) => Buffer.concat([sha256(rpId), Buffer.from([flags]), counter(value)]);

  return {
    id,
    registration(challenge: string, origin = 'http://localhost:3000', userVerified = true): RegistrationResponseJSON {
      const length = Buffer.alloc(2); length.writeUInt16BE(credentialId.length);
      const authData = Buffer.concat([baseData(userVerified ? 0x45 : 0x41, 0), Buffer.alloc(16), length, credentialId, Buffer.from(cose)]);
      const attestationObject = isoCBOR.encode(new Map<string, string | Uint8Array | Map<string, string>>([
        ['fmt', 'none'], ['authData', authData], ['attStmt', new Map<string, string>()],
      ]));
      const clientDataJSON = Buffer.from(JSON.stringify({ type: 'webauthn.create', challenge, origin }));
      return {
        id, rawId: id, type: 'public-key',
        response: { clientDataJSON: b64(clientDataJSON), attestationObject: b64(attestationObject), transports: ['internal'] },
        clientExtensionResults: {},
      } as RegistrationResponseJSON;
    },
    assertion(challenge: string, origin = 'http://localhost:3000', userVerified = true): AuthenticationResponseJSON {
      const authenticatorData = baseData(userVerified ? 0x05 : 0x01, 1);
      const clientDataJSON = Buffer.from(JSON.stringify({ type: 'webauthn.get', challenge, origin }));
      const signature = sign('sha256', Buffer.concat([authenticatorData, sha256(clientDataJSON)]), privateKey);
      return {
        id, rawId: id, type: 'public-key',
        response: { clientDataJSON: b64(clientDataJSON), authenticatorData: b64(authenticatorData), signature: b64(signature), userHandle: b64(Buffer.from('test-user')) },
        clientExtensionResults: {},
      } as AuthenticationResponseJSON;
    },
  };
}

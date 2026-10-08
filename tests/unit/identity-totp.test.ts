import { describe, expect, it } from 'bun:test';
import * as OTPAuth from 'otpauth';
import { createTotpSecret, decryptTotpSecret, encryptTotpSecret, verifyTotpCode } from '../../src/modules/identity/totp';

describe('authenticator codes', () => {
  it('encrypts the secret and rejects a reused 30-second step', () => {
    const key = 'a'.repeat(64);
    const secret = createTotpSecret();
    const encrypted = encryptTotpSecret(secret, key);
    expect(encrypted.ciphertext).not.toContain(secret);
    expect(decryptTotpSecret(encrypted, key)).toBe(secret);
    const timestamp = 1_700_000_000_000;
    const code = OTPAuth.TOTP.generate({ secret: OTPAuth.Secret.fromBase32(secret), period: 30, timestamp });
    const step = verifyTotpCode(secret, code, null, timestamp);
    expect(step).toBe(Math.floor(timestamp / 30_000));
    expect(verifyTotpCode(secret, code, step, timestamp)).toBeNull();
  });
});

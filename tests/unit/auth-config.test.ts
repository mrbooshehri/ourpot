import { describe, expect, it } from 'bun:test';
import { loadConfig } from '../../src/config';

describe('authentication configuration', () => {
  it('rejects production without HTTPS and a TOTP encryption key', () => {
    expect(() => loadConfig({ NODE_ENV: 'production', PUBLIC_ORIGIN: 'http://example.com', TOTP_ENCRYPTION_KEY: 'a'.repeat(64) })).toThrow();
    expect(() => loadConfig({ NODE_ENV: 'production', PUBLIC_ORIGIN: 'https://example.com' })).toThrow();
  });

  it('accepts explicit localhost development configuration', () => {
    const config = loadConfig({ NODE_ENV: 'development', PUBLIC_ORIGIN: 'http://localhost:3000', WEBAUTHN_RP_ID: 'localhost', AUTH_ALLOW_INSECURE_LOCALHOST: 'true', TOTP_ENCRYPTION_KEY: 'a'.repeat(64) });
    expect(config.publicOrigin).toBe('http://localhost:3000');
    expect(config.rpId).toBe('localhost');
    expect(config.allowInsecureLocalhostCookie).toBe(true);
  });

  it('rejects insecure cookies unless explicitly enabled on localhost', () => {
    expect(() => loadConfig({ NODE_ENV: 'development', PUBLIC_ORIGIN: 'http://example.com' })).toThrow();
    expect(() => loadConfig({ NODE_ENV: 'development', PUBLIC_ORIGIN: 'http://localhost:3000' })).toThrow();
  });
});

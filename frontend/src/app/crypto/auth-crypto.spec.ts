import { createSigningKey, signChallenge } from './auth-crypto';

describe('auth-crypto', () => {
  it('wraps the signing key with the vault passphrase only', async () => {
    const material = await createSigningKey('vault-passphrase', 120_000);
    const message = 'vault-auth-v1\n1\n1\nuser\nhttp://localhost\n2026-01-01T00:00:00';

    const byPassphrase = await signChallenge('vault-passphrase', material.wrapped, message);

    expect(byPassphrase).toBeTruthy();
    expect(material.wrapped.kdf_salt_b64).toBeTruthy();
    expect(material.wrapped.kdf_iterations).toBe(120_000);
    expect(material.wrapped.recovery_wrapped_private_key_b64).toBe('');
  });
});

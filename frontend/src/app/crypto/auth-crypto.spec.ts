import { createSigningKey, rewrapSigningKeyWithPassphrase, signChallenge, signChallengeWithRecovery } from './auth-crypto';

describe('auth-crypto', () => {
  it('wraps the signing key for both the vault passphrase and recovery key', async () => {
    const material = await createSigningKey('vault-passphrase', 'recovery-key', 120_000);
    const message = 'vault-auth-v1\n1\n1\nuser\nhttp://localhost\n2026-01-01T00:00:00';

    const byPassphrase = await signChallenge('vault-passphrase', material.wrapped, message);
    const byRecovery = await signChallengeWithRecovery('recovery-key', material.wrapped, message);

    expect(byPassphrase).toBeTruthy();
    expect(byRecovery).toBeTruthy();
    expect(material.wrapped.kdf_salt_b64).toBeTruthy();
    expect(material.wrapped.kdf_iterations).toBe(120_000);
    expect(material.wrapped.recovery_wrapped_private_key_b64).toContain('.');

    const rewrapped = await rewrapSigningKeyWithPassphrase('recovery-key', material.wrapped, 'new-vault-passphrase');
    expect(await signChallenge('new-vault-passphrase', rewrapped, message)).toBeTruthy();
  });
});

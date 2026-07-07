import {
  createVaultMaterial,
  decryptJson,
  encryptJson,
  generateDataKey,
  hmacBlindIndex,
  randomBytes,
  randomClientId,
  rewrapDekWithPassphrase,
  unlockWithPassphrase,
  unlockWithRecoveryKey,
} from './vault-crypto';

describe('vault-crypto', () => {
  const fastIterations = 120_000;

  it('generates random bytes and client ids', () => {
    const a = randomBytes(16);
    const b = randomBytes(16);
    expect(a.length).toBe(16);
    expect(b.length).toBe(16);
    expect(Array.from(a)).not.toEqual(Array.from(b));
    const id = randomClientId('tx');
    expect(id.startsWith('tx_')).toBeTrue();
    expect(id.length).toBeGreaterThan(8);
  });

  it('encrypts and decrypts JSON with a DEK', async () => {
    const dek = await generateDataKey();
    const payload = { amount: 12.34, name: 'Cash', nested: { ok: true } };
    const ct = await encryptJson(dek, payload);
    expect(typeof ct).toBe('string');
    expect(ct.length).toBeGreaterThan(20);
    const plain = await decryptJson<typeof payload>(dek, ct);
    expect(plain).toEqual(payload);
  });

  it('creates a vault and unlocks with passphrase', async () => {
    const passphrase = 'correct-horse-battery-staple';
    const material = await createVaultMaterial(passphrase, fastIterations);
    expect(material.recoveryKey.length).toBeGreaterThan(20);
    expect(material.setupPayload.kdf_algorithm).toBe('PBKDF2');
    expect(material.setupPayload.kdf_iterations).toBe(fastIterations);
    expect(material.setupPayload.wrapped_dek_b64).toBeTruthy();

    const unlocked = await unlockWithPassphrase(
      passphrase,
      material.setupPayload.kdf_salt_b64,
      material.setupPayload.kdf_iterations,
      material.setupPayload.wrapped_dek_b64
    );
    const message = { hello: 'world', n: 1 };
    const ct = await encryptJson(material.dek, message);
    const roundTrip = await decryptJson<typeof message>(unlocked, ct);
    expect(roundTrip).toEqual(message);
  });

  it('rejects wrong passphrase', async () => {
    const material = await createVaultMaterial('right-passphrase-12', fastIterations);
    await expectAsync(
      unlockWithPassphrase(
        'wrong-passphrase-12',
        material.setupPayload.kdf_salt_b64,
        material.setupPayload.kdf_iterations,
        material.setupPayload.wrapped_dek_b64
      )
    ).toBeRejected();
  });

  it('unlocks with recovery key and rewraps passphrase', async () => {
    const material = await createVaultMaterial('original-passphrase-12', fastIterations);
    const recovered = await unlockWithRecoveryKey(
      material.recoveryKey,
      material.setupPayload.recovery_wrapped_dek_b64,
      fastIterations
    );
    const payload = { value: 99 };
    const ct = await encryptJson(material.dek, payload);
    expect(await decryptJson(recovered, ct)).toEqual(payload);

    const rewrap = await rewrapDekWithPassphrase(recovered, 'new-passphrase-12', fastIterations);
    const unlocked = await unlockWithPassphrase(
      'new-passphrase-12',
      rewrap.kdf_salt_b64,
      rewrap.kdf_iterations,
      rewrap.wrapped_dek_b64
    );
    expect(await decryptJson(unlocked, ct)).toEqual(payload);
  });

  it('rejects invalid recovery material', async () => {
    await expectAsync(unlockWithRecoveryKey('key', 'not-packed', fastIterations)).toBeRejected();
  });

  it('produces stable blind indexes for the same DEK and value', async () => {
    const dek = await generateDataKey();
    const a = await hmacBlindIndex(dek, 'dedupe:abc');
    const b = await hmacBlindIndex(dek, 'dedupe:abc');
    const c = await hmacBlindIndex(dek, 'dedupe:xyz');
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a.length).toBeGreaterThan(10);
  });
});

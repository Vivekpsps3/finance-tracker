/**
 * Browser-only crypto for server-blind storage.
 * Backend never receives passphrases, recovery keys, or unwrapped DEKs.
 */

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export const DEFAULT_PBKDF2_ITERATIONS = 310_000;

function bufToB64(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function b64ToBuf(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function randomBytes(length: number): Uint8Array {
  const out = new Uint8Array(length);
  crypto.getRandomValues(out);
  return out;
}

export function randomClientId(prefix = 'rec'): string {
  const id = bufToB64(randomBytes(18)).replace(/[+/=]/g, '').slice(0, 22);
  return `${prefix}_${id}`;
}

export async function generateDataKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
    'encrypt',
    'decrypt',
  ]);
}

async function importAesKey(raw: ArrayBuffer | Uint8Array): Promise<CryptoKey> {
  const material = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
  return crypto.subtle.importKey('raw', material, { name: 'AES-GCM' }, true, [
    'encrypt',
    'decrypt',
  ]);
}

async function exportRawKey(key: CryptoKey): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.exportKey('raw', key));
}

async function deriveWrapKey(
  passphrase: string,
  salt: Uint8Array,
  iterations: number
): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', textEncoder.encode(passphrase), 'PBKDF2', false, [
    'deriveKey',
  ]);
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt,
      iterations,
      hash: 'SHA-256',
    },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/** Wrap format: base64(iv || ciphertext) where iv is 12 bytes. */
async function wrapKey(dek: CryptoKey, wrapKeyMaterial: CryptoKey): Promise<string> {
  const iv = randomBytes(12);
  const raw = await exportRawKey(dek);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, wrapKeyMaterial, raw);
  const out = new Uint8Array(iv.length + ct.byteLength);
  out.set(iv, 0);
  out.set(new Uint8Array(ct), iv.length);
  return bufToB64(out);
}

async function unwrapKey(wrappedB64: string, wrapKeyMaterial: CryptoKey): Promise<CryptoKey> {
  const packed = b64ToBuf(wrappedB64);
  const iv = packed.slice(0, 12);
  const ct = packed.slice(12);
  const raw = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, wrapKeyMaterial, ct);
  return importAesKey(raw);
}

export async function createVaultMaterial(passphrase: string, iterations = DEFAULT_PBKDF2_ITERATIONS) {
  const dek = await generateDataKey();
  const salt = randomBytes(16);
  const passKey = await deriveWrapKey(passphrase, salt, iterations);
  const recoveryKey = bufToB64(randomBytes(32)).replace(/[+/=]/g, '').slice(0, 40);
  const recoverySalt = randomBytes(16);
  // Recovery uses the recovery key string as passphrase material with its own salt, fixed iterations.
  const recoveryWrapKey = await deriveWrapKey(recoveryKey, recoverySalt, iterations);
  const wrappedDek = await wrapKey(dek, passKey);
  const recoveryWrapped = await wrapKey(dek, recoveryWrapKey);
  // Pack recovery salt into recovery wrap payload as saltB64 || wrapped
  const recoveryPacked = `${bufToB64(recoverySalt)}.${recoveryWrapped}`;
  return {
    dek,
    recoveryKey,
    setupPayload: {
      kdf_algorithm: 'PBKDF2' as const,
      kdf_salt_b64: bufToB64(salt),
      kdf_iterations: iterations,
      wrapped_dek_b64: wrappedDek,
      recovery_wrapped_dek_b64: recoveryPacked,
      key_version: 1,
    },
  };
}

export async function unlockWithPassphrase(
  passphrase: string,
  kdfSaltB64: string,
  kdfIterations: number,
  wrappedDekB64: string
): Promise<CryptoKey> {
  const salt = b64ToBuf(kdfSaltB64);
  const passKey = await deriveWrapKey(passphrase, salt, kdfIterations);
  return unwrapKey(wrappedDekB64, passKey);
}

export async function unlockWithRecoveryKey(
  recoveryKey: string,
  recoveryPacked: string,
  kdfIterations: number
): Promise<CryptoKey> {
  const [saltB64, wrapped] = recoveryPacked.split('.');
  if (!saltB64 || !wrapped) throw new Error('Invalid recovery material');
  const salt = b64ToBuf(saltB64);
  const wrapKeyMaterial = await deriveWrapKey(recoveryKey, salt, kdfIterations);
  return unwrapKey(wrapped, wrapKeyMaterial);
}

export async function rewrapDekWithPassphrase(
  dek: CryptoKey,
  passphrase: string,
  iterations = DEFAULT_PBKDF2_ITERATIONS
) {
  const salt = randomBytes(16);
  const passKey = await deriveWrapKey(passphrase, salt, iterations);
  return {
    kdf_salt_b64: bufToB64(salt),
    kdf_iterations: iterations,
    wrapped_dek_b64: await wrapKey(dek, passKey),
  };
}

/** Encrypt JSON-serializable payload. Output base64(iv || ciphertext). */
export async function encryptJson(dek: CryptoKey, value: unknown): Promise<string> {
  const iv = randomBytes(12);
  const plain = textEncoder.encode(JSON.stringify(value));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, dek, plain);
  const out = new Uint8Array(iv.length + ct.byteLength);
  out.set(iv, 0);
  out.set(new Uint8Array(ct), iv.length);
  return bufToB64(out);
}

export async function decryptJson<T>(dek: CryptoKey, ciphertextB64: string): Promise<T> {
  const packed = b64ToBuf(ciphertextB64);
  const iv = packed.slice(0, 12);
  const ct = packed.slice(12);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, dek, ct);
  return JSON.parse(textDecoder.decode(plain)) as T;
}

export async function hmacBlindIndex(dek: CryptoKey, value: string): Promise<string> {
  // Derive a non-extractable HMAC key from DEK raw material via HKDF-like digest.
  const raw = await exportRawKey(dek);
  const keyMaterial = await crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ]);
  const sig = await crypto.subtle.sign('HMAC', keyMaterial, textEncoder.encode(value));
  return bufToB64(sig);
}

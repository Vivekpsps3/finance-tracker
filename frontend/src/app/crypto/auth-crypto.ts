const encoder = new TextEncoder();

export interface WrappedSigningKey {
  kdf_salt_b64: string;
  kdf_iterations: number;
  wrapped_private_key_b64: string;
  /** Legacy field; recovery-key path removed. Always empty for new wraps. */
  recovery_wrapped_private_key_b64: string;
}

const ITERATIONS = 310_000;

function toB64(value: ArrayBuffer | Uint8Array): string {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  let binary = '';
  bytes.forEach(byte => (binary += String.fromCharCode(byte)));
  return btoa(binary);
}

function fromB64(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

function random(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

async function passphraseKey(passphrase: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey('raw', encoder.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

async function encryptPrivateKey(privateKey: ArrayBuffer, wrappingKey: CryptoKey): Promise<string> {
  const iv = random(12);
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, wrappingKey, privateKey);
  const packed = new Uint8Array(iv.length + ciphertext.byteLength);
  packed.set(iv);
  packed.set(new Uint8Array(ciphertext), iv.length);
  return toB64(packed);
}

async function importWrappedPrivateKey(wrappedB64: string, wrappingKey: CryptoKey): Promise<CryptoKey> {
  const packed = fromB64(wrappedB64);
  const privateKey = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: packed.slice(0, 12) },
    wrappingKey,
    packed.slice(12)
  );
  return crypto.subtle.importKey('pkcs8', privateKey, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
}

export async function createSigningKey(
  passphrase: string,
  iterations = ITERATIONS
): Promise<{ publicKeyB64: string; wrapped: WrappedSigningKey }> {
  const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
  const salt = random(16);
  const privateKey = await crypto.subtle.exportKey('pkcs8', pair.privateKey);
  return {
    publicKeyB64: toB64(await crypto.subtle.exportKey('spki', pair.publicKey)),
    wrapped: {
      kdf_salt_b64: toB64(salt),
      kdf_iterations: iterations,
      wrapped_private_key_b64: await encryptPrivateKey(
        privateKey,
        await passphraseKey(passphrase, salt, iterations)
      ),
      recovery_wrapped_private_key_b64: '',
    },
  };
}

export async function signChallenge(
  passphrase: string,
  wrapped: WrappedSigningKey,
  message: string
): Promise<string> {
  const key = await importWrappedPrivateKey(
    wrapped.wrapped_private_key_b64,
    await passphraseKey(passphrase, fromB64(wrapped.kdf_salt_b64), wrapped.kdf_iterations)
  );
  return toB64(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, encoder.encode(message)));
}

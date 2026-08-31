import { Injectable } from '@angular/core';
import { io, Socket } from 'socket.io-client';

@Injectable({
  providedIn: 'root'
})
export class EcdhService {
  private socket: Socket;
  private sharedKey: Uint8Array | null = null;
  private privateKey!: CryptoKey;
  private publicKey!: CryptoKey;

  private decryptionPromises: Map<string, { resolve: Function, reject: Function }> = new Map();
  private messageCounter = 0;

  constructor() {
    const serverUrl = window.location.hostname === '127.0.0.1' ? 'http://127.0.0.1:5000' : 'https://vivekpanchagnula.com/';
    this.socket = io(serverUrl);
    this.generateEccKey();
    this.setupSocketListeners();
  }

  private setupSocketListeners() {
    this.socket.on("decrypted_message", (result) => {
      console.log("Received decrypted message from server:", result);
      if (this.decryptionPromises.size > 0) {
        const [messageId, pendingPromise] = Array.from(this.decryptionPromises.entries())[0];
        pendingPromise.resolve(result.text);
        this.decryptionPromises.delete(messageId);
      } else {
        console.warn("Received decrypted_message but no pending promises found");
      }
    });

    this.socket.on("error", (errorData) => {
      console.error("Socket error:", errorData.message);

      if (this.decryptionPromises.size > 0) {
        const [messageId, pendingPromise] = Array.from(this.decryptionPromises.entries())[0];
        pendingPromise.reject(new Error(errorData.message));
        this.decryptionPromises.delete(messageId);
      }
    });
  }

  private async generateEccKey() {
    const keyPair = await window.crypto.subtle.generateKey(
      { name: "ECDH", namedCurve: "P-256" },
      true,
      ["deriveKey", "deriveBits"]
    );
    this.privateKey = keyPair.privateKey;
    this.publicKey = keyPair.publicKey;

    const exportedKey = await window.crypto.subtle.exportKey("raw", this.publicKey);
    const clientPublicKeyHex = Array.from(new Uint8Array(exportedKey)).map(b => b.toString(16).padStart(2, '0')).join('');

    this.socket.emit("exchange_keys", clientPublicKeyHex);
    this.socket.on("server_public_key", (serverPublicKeyHex: string) => this.deriveSharedKey(serverPublicKeyHex));
  }

  private async deriveSharedKey(serverPublicKeyHex: string) {
    const serverPublicKeyBytes = Uint8Array.from(serverPublicKeyHex.match(/.{1,2}/g)!.map(byte => parseInt(byte, 16)));
    const serverPublicKey = await window.crypto.subtle.importKey(
      "raw",
      serverPublicKeyBytes,
      { name: "ECDH", namedCurve: "P-256" },
      true,
      []
    );

    const sharedSecret = await window.crypto.subtle.deriveBits(
      { name: "ECDH", public: serverPublicKey },
      this.privateKey,
      256
    );

    this.sharedKey = new Uint8Array(sharedSecret);
  }

  async encryptMessage(plaintext: string) {
    if (!this.sharedKey) {
      throw new Error("Key exchange not complete");
    }

    const iv = window.crypto.getRandomValues(new Uint8Array(12));

    const key = await window.crypto.subtle.importKey(
      "raw",
      this.sharedKey,
      { name: "AES-GCM" },
      false,
      ["encrypt"]
    );

    const encoder = new TextEncoder();
    const plaintextBytes = encoder.encode(plaintext);

    const ciphertextWithTag = await window.crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: iv,
      },
      key,
      plaintextBytes
    );

    const ciphertextWithTagArray = new Uint8Array(ciphertextWithTag);

    const tagLength = 16;
    const ciphertextArray = ciphertextWithTagArray.slice(0, -tagLength);
    const tagArray = ciphertextWithTagArray.slice(-tagLength);

    return {
      iv: Array.from(iv),
      ciphertext: Array.from(ciphertextArray),
      tag: Array.from(tagArray),
    };
  }

  async decryptMessage(encryptedData: any) {
    if (!this.sharedKey) {
      throw new Error("Key exchange not complete");
    }

    const { iv, ciphertext, tag } = encryptedData;

    if (!iv || !ciphertext) {
      throw new Error("Missing required encryption data (IV or ciphertext)");
    }

    const sharedKeyHex = Array.from(this.sharedKey)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    const ivHex = Array.from(iv)
      .map(b => (typeof b === 'number' ? b : 0).toString(16).padStart(2, '0'))
      .join('');

    const ciphertextHex = Array.from(ciphertext)
      .map(b => (typeof b === 'number' ? b : 0).toString(16).padStart(2, '0'))
      .join('');

    const tagHex = tag ? Array.from(tag)
      .map(b => (typeof b === 'number' ? b : 0).toString(16).padStart(2, '0'))
      .join('') : '';

    const messageId = (this.messageCounter++).toString();

    return new Promise<string>((resolve, reject) => {
      this.decryptionPromises.set(messageId, { resolve, reject });

      this.socket.emit("decrypt_message", {
        shared_key: sharedKeyHex,
        iv: ivHex,
        ciphertext: ciphertextHex,
        tag: tagHex || '00',
      });

      setTimeout(() => {
        if (this.decryptionPromises.has(messageId)) {
          this.decryptionPromises.delete(messageId);
          reject(new Error("Decryption request timed out"));
        }
      }, 30000);
    });
  }

  isKeyExchangeComplete(): boolean {
    return this.sharedKey !== null;
  }
}

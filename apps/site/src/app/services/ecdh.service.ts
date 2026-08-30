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
  
  // Add properties to track pending operations
  private encryptionPromises: Map<string, { resolve: Function, reject: Function }> = new Map();
  private decryptionPromises: Map<string, { resolve: Function, reject: Function }> = new Map();
  private messageCounter = 0;

  constructor() {
    const serverUrl = window.location.hostname === '127.0.0.1' ? 'http://127.0.0.1:5000' : 'https://vivekpanchagnula.com/';
    this.socket = io(serverUrl); // Connect to Flask server
    this.generateEccKey();
    this.setupSocketListeners();
  }

  // Setup socket event listeners
  private setupSocketListeners() {
    this.socket.on("encrypted_message", (result) => {
      console.log("Received encrypted message from server:", result);
      // Use the first pending promise in the Map
      if (this.encryptionPromises.size > 0) {
        const [messageId, pendingPromise] = Array.from(this.encryptionPromises.entries())[0];
        
        try {
          // Convert hex strings to arrays for compatibility
          const iv = Array.from(this.hexToUint8Array(result.iv));
          const ciphertext = Array.from(this.hexToUint8Array(result.ciphertext));
          const tag = Array.from(this.hexToUint8Array(result.tag));
          
          pendingPromise.resolve({ iv, ciphertext, tag });
        } catch (error) {
          pendingPromise.reject(error);
        } finally {
          this.encryptionPromises.delete(messageId);
        }
      } else {
        console.warn("Received encrypted_message but no pending promises found");
      }
    });

    this.socket.on("decrypted_message", (result) => {
      console.log("Received decrypted message from server:", result);
      // Use the first pending promise in the Map
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
      
      // Reject the first pending promise in either map
      if (this.encryptionPromises.size > 0) {
        const [messageId, pendingPromise] = Array.from(this.encryptionPromises.entries())[0];
        pendingPromise.reject(new Error(errorData.message));
        this.encryptionPromises.delete(messageId);
      }
      
      if (this.decryptionPromises.size > 0) {
        const [messageId, pendingPromise] = Array.from(this.decryptionPromises.entries())[0];
        pendingPromise.reject(new Error(errorData.message));
        this.decryptionPromises.delete(messageId);
      }
    });
  }
  
  // Helper method to convert hex string to Uint8Array
  private hexToUint8Array(hexString: string): Uint8Array {
    if (hexString.length % 2 !== 0) {
      throw new Error('Hex string must have an even number of characters');
    }
    
    const byteArray = new Uint8Array(hexString.length / 2);
    for (let i = 0; i < hexString.length; i += 2) {
      byteArray[i / 2] = parseInt(hexString.substring(i, i + 2), 16);
    }
    return byteArray;
  }

  // 1. Generate ECC Key Pair
  private async generateEccKey() {
    const keyPair = await window.crypto.subtle.generateKey(
      { name: "ECDH", namedCurve: "P-256" },
      true,
      ["deriveKey", "deriveBits"]
    );
    this.privateKey = keyPair.privateKey;
    this.publicKey = keyPair.publicKey;

    // Export Public Key
    const exportedKey = await window.crypto.subtle.exportKey("raw", this.publicKey);
    const clientPublicKeyHex = Array.from(new Uint8Array(exportedKey)).map(b => b.toString(16).padStart(2, '0')).join('');

    // Send to Server
    this.socket.emit("exchange_keys", clientPublicKeyHex);
    this.socket.on("server_public_key", (serverPublicKeyHex: string) => this.deriveSharedKey(serverPublicKeyHex));
  }

  // 2. Compute Shared Secret
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

  // 3. Encrypt Message - now using the server
  async encryptMessage(plaintext: string) {
    if (!this.sharedKey) {
      throw new Error("Key exchange not complete");
    }

    // Convert the shared key Uint8Array to hex string
    // Removed unused variable 'sharedKeyHex'
    
    // Create a unique message ID
    const messageId = (this.messageCounter++).toString();
    
    // Removed unused variable 'messageId'
    const iv = window.crypto.getRandomValues(new Uint8Array(12));

    // Import the shared key for encryption
    const key = await window.crypto.subtle.importKey(
      "raw",
      this.sharedKey,
      { name: "AES-GCM" },
      false,
      ["encrypt"]
    );

    // Encode the plaintext as a Uint8Array
    const encoder = new TextEncoder();
    const plaintextBytes = encoder.encode(plaintext);

    // Encrypt the plaintext
    const ciphertextWithTag = await window.crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: iv,
      },
      key,
      plaintextBytes
    );

    // Convert the ciphertextWithTag to a Uint8Array
    const ciphertextWithTagArray = new Uint8Array(ciphertextWithTag);

    // Separate the tag from the ciphertext
    const tagLength = 16; // AES-GCM tag length is 16 bytes
    const ciphertextArray = ciphertextWithTagArray.slice(0, -tagLength);
    const tagArray = ciphertextWithTagArray.slice(-tagLength);

    // Return the encrypted data
    return {
      iv: Array.from(iv),
      ciphertext: Array.from(ciphertextArray),
      tag: Array.from(tagArray),
    };
  }

  // 4. Decrypt Message - now using the server
  async decryptMessage(encryptedData: any) {
    if (!this.sharedKey) {
      throw new Error("Key exchange not complete");
    }
    
    const { iv, ciphertext, tag } = encryptedData;
    
    if (!iv || !ciphertext) {
      throw new Error("Missing required encryption data (IV or ciphertext)");
    }
    
    // Convert the shared key Uint8Array to hex string
    const sharedKeyHex = Array.from(this.sharedKey)
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    
    // Convert arrays to hex strings for transmission
    const ivHex = Array.from(iv)
      .map(b => (typeof b === 'number' ? b : 0).toString(16).padStart(2, '0'))
      .join('');
    
    const ciphertextHex = Array.from(ciphertext)
      .map(b => (typeof b === 'number' ? b : 0).toString(16).padStart(2, '0'))
      .join('');
    
    const tagHex = tag ? Array.from(tag)
      .map(b => (typeof b === 'number' ? b : 0).toString(16).padStart(2, '0'))
      .join('') : '';
    
    // Create a unique message ID
    const messageId = (this.messageCounter++).toString();
    
    return new Promise<string>((resolve, reject) => {
      // Store the promise callbacks for later resolution
      this.decryptionPromises.set(messageId, { resolve, reject });
      
      // Send to server for decryption
      console.log("Sending decrypt_message request to server");
      this.socket.emit("decrypt_message", {
        shared_key: sharedKeyHex,
        iv: ivHex,
        ciphertext: ciphertextHex,
        tag: tagHex || '00', // Provide a default if tag is not available
      });
      
      // Set timeout for response
      setTimeout(() => {
        if (this.decryptionPromises.has(messageId)) {
          this.decryptionPromises.delete(messageId);
          reject(new Error("Decryption request timed out"));
        }
      }, 30000); // Increased timeout to 30 seconds
    });
  }
  
  // 5. Check if key exchange is complete
  isKeyExchangeComplete(): boolean {
    return this.sharedKey !== null;
  }
}

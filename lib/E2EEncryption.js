// End-to-end encryption for message privacy
export class E2EEncryption {
  constructor() {
    this.keyPair = null;
    this.partnerPublicKey = null;
    this.sessionKey = null;
  }

  // Generate key pair for this user
  async generateKeyPair() {
    try {
      this.keyPair = await window.crypto.subtle.generateKey(
        {
          name: "ECDH",
          namedCurve: "P-256"
        },
        true,
        ["deriveKey"]
      );
      
      return await this.exportPublicKey();
    } catch (error) {
      console.error('Key generation failed:', error);
      throw error;
    }
  }

  // Export public key for sharing
  async exportPublicKey() {
    if (!this.keyPair) throw new Error('No key pair generated');
    
    const exported = await window.crypto.subtle.exportKey(
      "spki",
      this.keyPair.publicKey
    );
    
    return btoa(String.fromCharCode(...new Uint8Array(exported)));
  }

  // Import partner's public key
  async importPartnerPublicKey(publicKeyString) {
    try {
      const keyData = new Uint8Array(
        atob(publicKeyString).split('').map(c => c.charCodeAt(0))
      );
      
      this.partnerPublicKey = await window.crypto.subtle.importKey(
        "spki",
        keyData,
        {
          name: "ECDH",
          namedCurve: "P-256"
        },
        false,
        []
      );
      
      // Derive shared session key
      await this.deriveSessionKey();
    } catch (error) {
      console.error('Partner key import failed:', error);
      throw error;
    }
  }

  // Derive shared encryption key
  async deriveSessionKey() {
    if (!this.keyPair || !this.partnerPublicKey) {
      throw new Error('Missing keys for derivation');
    }

    const sharedSecret = await window.crypto.subtle.deriveKey(
      {
        name: "ECDH",
        public: this.partnerPublicKey
      },
      this.keyPair.privateKey,
      {
        name: "AES-GCM",
        length: 256
      },
      false,
      ["encrypt", "decrypt"]
    );

    this.sessionKey = sharedSecret;
  }

  // Encrypt message
  async encryptMessage(plaintext) {
    if (!this.sessionKey) {
      throw new Error('No session key available');
    }

    const encoder = new TextEncoder();
    const data = encoder.encode(plaintext);
    const iv = window.crypto.getRandomValues(new Uint8Array(12));

    const encrypted = await window.crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: iv
      },
      this.sessionKey,
      data
    );

    return {
      ciphertext: btoa(String.fromCharCode(...new Uint8Array(encrypted))),
      iv: btoa(String.fromCharCode(...iv))
    };
  }

  // Decrypt message
  async decryptMessage(encryptedData) {
    if (!this.sessionKey) {
      throw new Error('No session key available');
    }

    const ciphertext = new Uint8Array(
      atob(encryptedData.ciphertext).split('').map(c => c.charCodeAt(0))
    );
    const iv = new Uint8Array(
      atob(encryptedData.iv).split('').map(c => c.charCodeAt(0))
    );

    const decrypted = await window.crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: iv
      },
      this.sessionKey,
      ciphertext
    );

    const decoder = new TextDecoder();
    return decoder.decode(decrypted);
  }
}

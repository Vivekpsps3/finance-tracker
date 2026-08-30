import { Component, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { EcdhService } from '../../services/ecdh.service';
import { MarkdownModule } from 'ngx-markdown';

@Component({
  selector: 'app-secrets',
  standalone: true,
  imports: [FormsModule, MarkdownModule],
  templateUrl: './secrets.component.html',
})
export class SecretsComponent implements OnInit {
  decryptedMessage = '';
  encryptedData: any = null;
  message = '';
  isEncrypting = false;
  isDecrypting = false;
  errorMessage = '';
  keyExchangeComplete = false;

  constructor(private ecdhService: EcdhService) {}

  ngOnInit(): void {
    setTimeout(() => {
      this.keyExchangeComplete = this.ecdhService.isKeyExchangeComplete();
      if (!this.keyExchangeComplete) {
        this.errorMessage = 'Timed out. Reload to start a new key exchange.';
      }
    }, 1000);
  }

  async encryptMessage() {
    if (!this.message) {
      this.errorMessage = 'Please enter a message to encrypt';
      return;
    }
    this.isEncrypting = true;
    this.errorMessage = '';
    try {
      this.encryptedData = await this.ecdhService.encryptMessage(this.message);
      this.decryptedMessage = '';
    } catch (error: any) {
      this.errorMessage = `Encryption failed: ${error.message || error}`;
    } finally {
      this.isEncrypting = false;
    }
  }

  async decryptMessage() {
    if (!this.encryptedData) {
      this.errorMessage = 'No encrypted data to decrypt';
      return;
    }
    this.isDecrypting = true;
    this.errorMessage = '';
    try {
      this.decryptedMessage = await this.ecdhService.decryptMessage(this.encryptedData);
    } catch (error: any) {
      this.errorMessage = `Decryption failed: ${error.message || error}`;
      this.decryptedMessage = '';
    } finally {
      this.isDecrypting = false;
    }
  }

  displayCiphertext(): string {
    if (!this.encryptedData?.ciphertext?.length) return 'No ciphertext available';
    const prefix = this.encryptedData.ciphertext.slice(0, 20).join(',');
    return this.encryptedData.ciphertext.length > 20
      ? `${prefix}... (${this.encryptedData.ciphertext.length} bytes)`
      : prefix;
  }
}

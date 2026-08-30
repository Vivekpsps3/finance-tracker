import { Component, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { UiButtonComponent } from '../ui-button/ui-button.component';
import { UiCardComponent } from '../ui-card/ui-card.component';
import { UiInputComponent } from '../ui-input/ui-input.component';

export interface AuthApi {
  unlock(username: string, passphrase: string): Promise<void>;
}

@Component({
  selector: 'vivek-login',
  standalone: true,
  imports: [FormsModule, UiButtonComponent, UiCardComponent, UiInputComponent],
  templateUrl: './vivek-login.component.html',
  styleUrl: './vivek-login.component.css',
  })
export class VivekLoginComponent {
  api = input.required<AuthApi>();
  title = input('Unlock');
  unlocked = output<void>();

  username = '';
  passphrase = '';
  loading = signal(false);
  error = signal('');

  async submit(): Promise<void> {
    if (this.loading()) return;
    this.loading.set(true);
    this.error.set('');
    try {
      await this.api().unlock(this.username.trim().toLowerCase(), this.passphrase);
      this.unlocked.emit();
    } catch {
      this.error.set('Could not unlock.');
    } finally {
      this.loading.set(false);
    }
  }
}

import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ConfirmService } from '../services/confirm.service';
import { UiButtonComponent } from './ui/ui-button/ui-button.component';
import { UiCardComponent } from './ui/ui-card/ui-card.component';

@Component({
  selector: 'app-confirm-dialog',
  standalone: true,
  imports: [UiButtonComponent, UiCardComponent],
  templateUrl: './confirm-dialog.component.html',
  styleUrl: './confirm-dialog.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ConfirmDialogComponent {
  private readonly confirmService = inject(ConfirmService);
  readonly state = toSignal(this.confirmService.state$, { initialValue: null });

  close(confirmed: boolean): void {
    this.confirmService.close(confirmed);
  }
}
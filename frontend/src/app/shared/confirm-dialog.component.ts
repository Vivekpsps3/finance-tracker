import { AfterViewChecked, ChangeDetectionStrategy, Component, ElementRef, HostListener, OnDestroy, ViewChild, inject } from '@angular/core';
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
export class ConfirmDialogComponent implements AfterViewChecked, OnDestroy {
  private readonly confirmService = inject(ConfirmService);
  private lastFocused: HTMLElement | null = null;
  private focusedDialog = false;
  @ViewChild('dialogPanel') private dialogPanel?: ElementRef<HTMLElement>;
  readonly state = toSignal(this.confirmService.state$, { initialValue: null });

  ngAfterViewChecked(): void {
    if (this.state() && !this.focusedDialog) {
      this.lastFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      this.focusedDialog = true;
      queueMicrotask(() => this.dialogPanel?.nativeElement.querySelector<HTMLElement>('button')?.focus());
    }
    if (!this.state()) this.focusedDialog = false;
  }

  ngOnDestroy(): void {
    this.restoreFocus();
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    if (this.state()) this.close(false);
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key !== 'Tab') return;
    const focusable = Array.from(this.dialogPanel?.nativeElement.querySelectorAll<HTMLElement>('button:not([disabled])') ?? []);
    if (focusable.length === 0) return;
    const currentIndex = focusable.indexOf(document.activeElement as HTMLElement);
    if (event.shiftKey && currentIndex <= 0) {
      event.preventDefault();
      focusable.at(-1)?.focus();
    } else if (!event.shiftKey && currentIndex === focusable.length - 1) {
      event.preventDefault();
      focusable[0].focus();
    }
  }

  close(confirmed: boolean): void {
    this.confirmService.close(confirmed);
    this.restoreFocus();
  }

  private restoreFocus(): void {
    this.lastFocused?.focus();
    this.lastFocused = null;
  }
}

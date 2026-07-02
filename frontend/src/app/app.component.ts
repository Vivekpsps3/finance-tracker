import { Component, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ToastService } from './services/toast.service';
import { ConfirmDialogComponent } from './shared/confirm-dialog.component';
import { UiButtonComponent } from './shared/ui/ui-button/ui-button.component';
import { ToastPayload } from './models/transaction.model';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, ConfirmDialogComponent, UiButtonComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent implements OnInit {
  toast: ToastPayload | null = null;

  constructor(private toastService: ToastService) {}

  ngOnInit() {
    this.toastService.toast$.subscribe(t => (this.toast = t));
  }

  dismissToast() {
    this.toastService.dismiss();
  }

  undoToast() {
    this.toast?.undo?.();
    this.toastService.dismiss();
  }
}
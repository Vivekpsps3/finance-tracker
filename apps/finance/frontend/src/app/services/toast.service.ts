import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { ToastKind, ToastPayload } from '../models/transaction.model';

@Injectable({ providedIn: 'root' })
export class ToastService {
  private _toast = new BehaviorSubject<ToastPayload | null>(null);
  toast$ = this._toast.asObservable();
  private timer: ReturnType<typeof setTimeout> | null = null;

  show(message: string, kind: ToastKind = 'success', undo?: () => void) {
    if (this.timer) clearTimeout(this.timer);
    this._toast.next({ message, kind, undo });
    const duration = undo ? 8000 : 4000;
    this.timer = setTimeout(() => this.dismiss(), duration);
  }

  success(message: string, undo?: () => void) {
    this.show(message, 'success', undo);
  }

  error(message: string) {
    this.show(message, 'error');
  }

  dismiss() {
    this._toast.next(null);
  }
}
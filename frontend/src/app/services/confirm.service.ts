import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';

export interface ConfirmState {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  resolve?: (confirmed: boolean) => void;
}

@Injectable({ providedIn: 'root' })
export class ConfirmService {
  private _state = new BehaviorSubject<ConfirmState | null>(null);
  state$ = this._state.asObservable();

  ask(title: string, message: string, confirmLabel = 'Delete', cancelLabel = 'Cancel'): Promise<boolean> {
    return new Promise(resolve => {
      this._state.next({ title, message, confirmLabel, cancelLabel, resolve });
    });
  }

  close(confirmed: boolean) {
    const current = this._state.value;
    current?.resolve?.(confirmed);
    this._state.next(null);
  }
}
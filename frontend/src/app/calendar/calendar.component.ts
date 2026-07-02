import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Subject, takeUntil } from 'rxjs';
import { FinanceService } from '../services/finance.service';
import { Transaction } from '../models/transaction.model';
import { todayIsoDate } from '../utils/date.util';
import {
  UiBadgeComponent,
  UiButtonComponent,
  UiCardComponent,
  UiEmptyStateComponent,
  UiPageHeaderComponent,
  UiIconComponent,
} from '../shared/ui';

interface CalendarDay {
  date: string;
  hasTransactions: boolean;
  isToday?: boolean;
}

@Component({
  selector: 'app-calendar',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    UiPageHeaderComponent,
    UiButtonComponent,
    UiCardComponent,
    UiBadgeComponent,
    UiEmptyStateComponent,
    UiIconComponent,
  ],
  templateUrl: './calendar.component.html',
  styleUrl: './calendar.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CalendarComponent implements OnInit, OnDestroy {
  currentDate = new Date();
  transactions: Transaction[] = [];
  selectedDate: string | null = null;
  selectedTransactions: Transaction[] = [];
  daysInMonth: CalendarDay[] = [];
  weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  focusedDayIndex = -1;

  private destroy$ = new Subject<void>();

  constructor(
    private financeService: FinanceService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit() {
    this.financeService.transactions$.pipe(takeUntil(this.destroy$)).subscribe(data => {
      this.transactions = data;
      this.generateCalendar();
      this.cdr.markForCheck();
    });
    this.financeService.getTransactions().pipe(takeUntil(this.destroy$)).subscribe({
      next: () => this.cdr.markForCheck(),
    });
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  generateCalendar() {
    const year = this.currentDate.getFullYear();
    const month = this.currentDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = todayIsoDate();

    this.daysInMonth = [];
    for (let i = 0; i < firstDay; i++) {
      this.daysInMonth.push({ date: '', hasTransactions: false });
    }
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      this.daysInMonth.push({
        date: dateStr,
        hasTransactions: this.transactions.some(t => t.date === dateStr),
        isToday: dateStr === today,
      });
    }
  }

  selectDay(day: CalendarDay) {
    if (!day.date) return;
    this.selectedDate = day.date;
    this.selectedTransactions = this.transactions.filter(t => t.date === day.date);
    this.cdr.markForCheck();
  }

  onDayKeydown(event: KeyboardEvent, day: CalendarDay, index: number) {
    if (!day.date) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      this.selectDay(day);
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      this.focusDay(index + 1);
    }
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      this.focusDay(index - 1);
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.focusDay(index + 7);
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.focusDay(index - 7);
    }
  }

  private focusDay(index: number) {
    const buttons = document.querySelectorAll<HTMLButtonElement>('.calendar-grid .day-btn');
    const el = buttons[index];
    if (el) el.focus();
  }

  goToday() {
    this.currentDate = new Date();
    this.generateCalendar();
    const today = todayIsoDate();
    const day = this.daysInMonth.find(d => d.date === today);
    if (day) this.selectDay(day);
    else this.cdr.markForCheck();
  }

  prevMonth() {
    this.currentDate = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth() - 1, 1);
    this.generateCalendar();
    this.selectedDate = null;
    this.selectedTransactions = [];
    this.cdr.markForCheck();
  }

  nextMonth() {
    this.currentDate = new Date(this.currentDate.getFullYear(), this.currentDate.getMonth() + 1, 1);
    this.generateCalendar();
    this.selectedDate = null;
    this.selectedTransactions = [];
    this.cdr.markForCheck();
  }

  getMonthName(): string {
    return this.currentDate.toLocaleString('default', { month: 'long', year: 'numeric' });
  }

  dayTotal(): number {
    return this.selectedTransactions.reduce(
      (sum, t) => sum + (t.type === 'income' ? t.amount : -t.amount),
      0
    );
  }
}
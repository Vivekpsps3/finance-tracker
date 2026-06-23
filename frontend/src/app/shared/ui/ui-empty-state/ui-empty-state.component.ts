import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'ui-empty-state',
  standalone: true,
  templateUrl: './ui-empty-state.component.html',
  styleUrl: './ui-empty-state.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UiEmptyStateComponent {
  title = input<string | undefined>(undefined);
  message = input('No data yet.');
}
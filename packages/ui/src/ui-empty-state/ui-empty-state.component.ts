import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { UiIconComponent, UiIconName } from '../ui-icon/ui-icon.component';

@Component({
  selector: 'ui-empty-state',
  standalone: true,
  imports: [UiIconComponent],
  templateUrl: './ui-empty-state.component.html',
  styleUrl: './ui-empty-state.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UiEmptyStateComponent {
  title = input<string | undefined>(undefined);
  message = input('No data yet.');
  /** Optional leading icon for visual consistency (UI-015). */
  icon = input<UiIconName | undefined>(undefined);
}
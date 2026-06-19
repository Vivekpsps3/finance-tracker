import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'ui-card',
  standalone: true,
  templateUrl: './ui-card.component.html',
  styleUrl: './ui-card.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UiCardComponent {
  title = input<string | undefined>(undefined);
  padding = input<'default' | 'none'>('default');
}
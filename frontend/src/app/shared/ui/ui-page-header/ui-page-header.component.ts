import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'ui-page-header',
  standalone: true,
  templateUrl: './ui-page-header.component.html',
  styleUrl: './ui-page-header.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UiPageHeaderComponent {
  title = input.required<string>();
  subtitle = input<string | undefined>(undefined);
}
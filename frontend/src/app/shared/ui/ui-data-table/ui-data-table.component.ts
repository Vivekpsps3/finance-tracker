import { ChangeDetectionStrategy, Component, input } from '@angular/core';

let nextTableCaptionId = 0;

@Component({
  selector: 'ui-data-table',
  standalone: true,
  templateUrl: './ui-data-table.component.html',
  styleUrl: './ui-data-table.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UiDataTableComponent {
  stickyHeader = input(false);
  caption = input<string | undefined>(undefined);
  ariaLabel = input<string | undefined>(undefined);
  readonly captionId = `ui-table-caption-${++nextTableCaptionId}`;
}
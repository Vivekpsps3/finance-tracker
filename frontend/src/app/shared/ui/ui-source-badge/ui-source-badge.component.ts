import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Financial data-plane source for aggregates and metrics. */
export type UiSourceKind = 'observed' | 'scheduled' | 'combined' | 'scenario';

const LABELS: Record<UiSourceKind, string> = {
  observed: 'Observed',
  scheduled: 'Scheduled',
  combined: 'Combined outlook',
  scenario: 'Scenario',
};

@Component({
  selector: 'ui-source-badge',
  standalone: true,
  template: `<span [class]="hostClass()" [attr.title]="title()">{{ label() }}</span>`,
  styles: [
    `
      .ui-source-badge {
        display: inline-flex;
        align-items: center;
        padding: 2px var(--space-2);
        border-radius: 999px;
        font-size: 0.7rem;
        font-weight: 600;
        line-height: 1.4;
        letter-spacing: 0.02em;
        text-transform: uppercase;
        border: 1px solid transparent;
      }
      .ui-source-badge--observed {
        background: rgba(59, 130, 246, 0.12);
        color: var(--accent);
        border-color: color-mix(in srgb, var(--accent) 35%, transparent);
      }
      .ui-source-badge--scheduled {
        background: rgba(168, 85, 247, 0.12);
        color: #c4b5fd;
        border-color: rgba(168, 85, 247, 0.35);
      }
      .ui-source-badge--combined {
        background: rgba(245, 158, 11, 0.12);
        color: var(--warning);
        border-color: rgba(245, 158, 11, 0.35);
      }
      .ui-source-badge--scenario {
        background: rgba(34, 197, 94, 0.12);
        color: var(--success);
        border-color: rgba(34, 197, 94, 0.35);
      }
    `,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UiSourceBadgeComponent {
  kind = input<UiSourceKind>('observed');
  title = input<string>('');

  label = computed(() => LABELS[this.kind()]);
  hostClass = computed(() => `ui-source-badge ui-source-badge--${this.kind()}`);
}

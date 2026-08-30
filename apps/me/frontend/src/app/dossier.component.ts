import { Component, EventEmitter, Input, Output } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { Dossier } from './api';

@Component({
  selector: 'app-dossier',
  styles: [`
    :host { position:absolute; inset:0; z-index:10; display:flex; flex-direction:column; background:var(--wall); padding:24px; }
    h1 { margin:8px 0 0; font:var(--heading); }
    .type { font:var(--label); color:var(--mute); }
    .fields { margin-top:32px; display:flex; flex-direction:column; gap:8px; }
    .k { font:var(--label); color:var(--mute); }
    .body { margin-top:32px; flex:1; overflow-y:auto; }
    .back { margin-top:32px; display:flex; flex-direction:column; gap:8px; }
  `],
  template: `
    <button class="hit" (click)="back.emit()">Back</button>
    @if (heading) { <h1>{{ heading }}</h1> }
    <div class="body">
      @if (errorText) {
        <p class="text-mute">Can't load this note. Close and try again.</p>
      } @else if (dossier) {
        @if (dossier.type) { <p class="type">{{ dossier.type }}</p> }
        @if (dossier.fields.length) {
          <div class="fields">
            @for (f of dossier.fields; track f.key) {
              <div><div class="k">{{ f.key }}</div><div>{{ f.text }}</div></div>
            }
          </div>
        }
        <div class="fields" (click)="onBody($event)">
          @if (dossier.missing) { <p class="text-mute">Not in the vault copy.</p> }
          @else if (!dossier.bodyHtml.trim()) { <p class="text-mute">Nothing written yet.</p> }
          @else { <div [innerHTML]="safeBody"></div> }
        </div>
        <div class="back">
          <p class="k">Backlinks</p>
          @if (!dossier.backlinks.length) { <p class="text-mute">Nothing links here.</p> }
          @for (l of dossier.backlinks; track l.src) {
            <button class="hit" (click)="open.emit(stem(l.src))">{{ l.title }}</button>
          }
        </div>
      }
    </div>
  `,
})
export class DossierComponent {
  constructor(private sanitizer: DomSanitizer) {}
  @Input() dossier: Dossier | null = null;
  @Input() errorText: string | null = null;
  @Input() knownTitle: string | null = null;
  @Output() back = new EventEmitter<void>();
  @Output() open = new EventEmitter<string>();
  get heading() { return this.dossier?.title ?? this.knownTitle ?? ''; }
  get safeBody(): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(this.dossier?.bodyHtml ?? '');
  }
  stem(p: string) { return (p.split('/').pop() ?? p).replace(/\.md$/i, ''); }
  onBody(ev: Event) {
    const chip = (ev.target as HTMLElement).closest('[data-wiki]') as HTMLElement | null;
    if (!chip?.dataset['wiki']) return;
    ev.preventDefault();
    this.open.emit(chip.dataset['wiki']);
  }
}

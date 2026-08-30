import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api } from './api';

type Line =
  | { kind: 'user'; text: string }
  | { kind: 'assistant'; text: string }
  | { kind: 'tool'; name: string; text: string };

@Component({
  selector: 'app-agent',
  imports: [FormsModule],
  styles: [`
    :host { display:flex; flex-direction:column; height:100%; min-height:0; background:var(--wall); padding:24px; box-sizing:border-box; }
    h1 { margin:0; font:var(--heading); }
    .log { margin-top:16px; flex:1; min-height:0; overflow-y:auto; display:flex; flex-direction:column; gap:12px; }
    .user { color:var(--accent); }
    .tool { color:var(--mute); font:var(--label); }
    .row { margin-top:16px; display:flex; gap:16px; }
    textarea { flex:1; min-height:48px; max-height:64px; resize:none; border:0; background:var(--tile); color:var(--ink); padding:8px 16px; }
  `],
  template: `
    <h1>Agent</h1>
    <div class="log">
      @if (!lines.length) { <p class="text-mute">pi. Vault is /data/vault — it can read and write the whole folder.</p> }
      @for (l of lines; track $index) {
        @if (l.kind === 'user') { <p class="user">{{ l.text }}</p> }
        @else if (l.kind === 'tool') { <p class="tool">{{ l.name }} {{ l.text }}</p> }
        @else { <p>{{ l.text }}</p> }
      }
    </div>
    <div class="row">
      <textarea placeholder="Tell the agent" [(ngModel)]="draft" (keydown.enter)="onEnter($event)"></textarea>
      <button class="hit" [disabled]="!canSend" (click)="send()">Send</button>
    </div>
  `,
})
export class AgentComponent {
  draft = '';
  busy = false;
  lines: Line[] = [];
  constructor(private api: Api) {}
  get canSend() { return this.draft.trim().length > 0 && !this.busy; }
  onEnter(ev: Event) { ev.preventDefault(); void this.send(); }
  async send() {
    const text = this.draft.trim();
    if (!text || this.busy) return;
    this.draft = '';
    this.busy = true;
    this.lines = [...this.lines, { kind: 'user', text }];
    let assistant = '';
    try {
      for await (const ev of this.api.agent(text)) {
        if (ev.type === 'text') {
          assistant += ev.delta;
          this._setAssistant(assistant);
        } else if (ev.type === 'tool' && ev.phase === 'start') {
          this.lines = [...this.lines, { kind: 'tool', name: ev.name, text: ev.args ? JSON.stringify(ev.args).slice(0, 120) : '…' }];
        } else if (ev.type === 'error') {
          this.lines = [...this.lines, { kind: 'assistant', text: ev.message }];
        }
      }
      if (!assistant) this._setAssistant(assistant || 'Done.');
    } catch {
      this.lines = [...this.lines, { kind: 'assistant', text: "Can't reach pi. Try again." }];
    } finally {
      this.busy = false;
    }
  }
  private _setAssistant(text: string) {
    const last = this.lines.at(-1);
    if (last?.kind === 'assistant') {
      this.lines = [...this.lines.slice(0, -1), { kind: 'assistant', text }];
    } else {
      this.lines = [...this.lines, { kind: 'assistant', text }];
    }
  }
}

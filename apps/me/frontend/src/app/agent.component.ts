import { Component, ElementRef, OnInit, ViewChild } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import { Api } from './api';
import { md } from './md';

type Line =
  | { kind: 'user'; text: string }
  | { kind: 'assistant'; text: string; html?: string }
  | { kind: 'tool'; name: string; text: string };

type Sess = { id: string; name: string; file: string; mtime: number };

const STORE = 'me-agent-session';

@Component({
  selector: 'app-agent',
  imports: [FormsModule],
  styles: [`
    :host { display:flex; flex-direction:column; height:100%; min-height:0; overflow:hidden; background:var(--wall); padding:24px; box-sizing:border-box; position:relative; }
    .head { display:flex; align-items:center; justify-content:space-between; flex-shrink:0; gap:8px; }
    h1 { margin:0; font:var(--heading); }
    .head .actions { display:flex; align-items:center; gap:8px; }
    select { height:48px; border:0; background:var(--tile); color:var(--ink); padding:0 12px; max-width:200px; font:var(--label); }
    .log { margin-top:16px; flex:1; min-height:0; overflow-y:auto; overscroll-behavior:contain; display:flex; flex-direction:column; gap:12px; }
    .user, .tool { margin:0; white-space:pre-wrap; overflow-wrap:anywhere; }
    .user { color:var(--accent); }
    .tool { color:var(--mute); font:var(--label); }
    .assistant { overflow-wrap:anywhere; }
    .assistant :is(h1,h2,h3) { font:var(--heading); margin:12px 0 8px; }
    .assistant :is(ul,ol) { margin:8px 0; padding-left:24px; }
    .assistant p { margin:0 0 8px; }
    .assistant pre { white-space:pre-wrap; font:var(--body); background:var(--tile); padding:8px 16px; overflow-x:auto; }
    .assistant code { font-family:ui-monospace,monospace; }
    .row { margin-top:16px; display:flex; gap:16px; flex-shrink:0; }
    textarea { flex:1; min-height:48px; max-height:64px; resize:none; border:0; background:var(--tile); color:var(--ink); padding:8px 16px; }
  `],
  template: `
    <div class="head">
      <h1>Agent</h1>
      <div class="actions">
        <select [ngModel]="sid" (ngModelChange)="onPick($event)" [disabled]="busy">
          @for (s of sessionList; track s.id) {
            <option [value]="s.id">{{ s.name }}</option>
          }
        </select>
        <button class="hit" [disabled]="busy" (click)="onNew()">New</button>
        <button class="hit" [disabled]="busy" (click)="onReset()">Reset</button>
      </div>
    </div>
    <div class="log" #log>
      @if (!lines.length) { <p class="text-mute">pi. Vault is /data/vault — it can read and write the whole folder.</p> }
      @for (l of lines; track $index) {
        @if (l.kind === 'user') { <pre class="user">{{ l.text }}</pre> }
        @else if (l.kind === 'tool') { <p class="tool">{{ l.name }} {{ l.text }}</p> }
        @else { <div class="assistant" [innerHTML]="html(l)"></div> }
      }
    </div>
    <div class="row">
      <textarea placeholder="Tell the agent" [(ngModel)]="chatDraft" (keydown.enter)="onEnter($event)"></textarea>
      <button class="hit" [disabled]="!canSend" (click)="send()">Send</button>
    </div>
  `,
})
export class AgentComponent implements OnInit {
  @ViewChild('log') log?: ElementRef<HTMLDivElement>;
  chatDraft = '';
  busy = false;
  lines: Line[] = [];
  sid = '';
  fresh = false;
  sessionList: Sess[] = [];

  constructor(private api: Api, private san: DomSanitizer) {}

  get canSend() { return this.chatDraft.trim().length > 0 && !this.busy; }

  html(l: Line): SafeHtml {
    if (l.kind !== 'assistant') return '';
    return this.san.bypassSecurityTrustHtml(l.html || md(l.text));
  }

  async ngOnInit() {
    let saved = '';
    try { saved = localStorage.getItem(STORE) ?? ''; } catch { /* private */ }
    await this.load(saved);
  }

  onEnter(ev: Event) { ev.preventDefault(); void this.send(); }

  async load(id = this.sid) {
    try {
      const data = await this.api.agentHistory(id);
      this.sessionList = data.sessions ?? [];
      this.sid = data.session?.id ?? '';
      this.lines = Array.isArray(data.lines) ? data.lines : [];
      this.fresh = false;
      this.remember();
      this.stick();
    } catch { /* keep last */ }
  }

  async onPick(id: string) {
    if (this.busy || id === this.sid) return;
    await this.load(id);
  }

  onNew() {
    if (this.busy) return;
    this.fresh = true;
    this.sid = '';
    this.lines = [];
  }

  async onReset() {
    if (this.busy) return;
    try {
      const data = await this.api.agentReset(this.sid);
      this.sessionList = data.sessions ?? [];
      this.sid = this.sessionList[0]?.id ?? '';
      this.lines = [];
      this.fresh = !this.sid;
      this.remember();
    } catch { /* keep last */ }
  }

  async send() {
    const text = this.chatDraft.trim();
    if (!text || this.busy) return;
    this.chatDraft = '';
    this.busy = true;
    const fresh = this.fresh;
    this.fresh = false;
    this.lines = [...this.lines, { kind: 'user', text }];
    this.stick();
    let assistant = '';
    try {
      for await (const ev of this.api.agent(text, { id: this.sid, fresh, name: 'wall' })) {
        if (ev.type === 'text') {
          assistant += ev.delta;
          this._setAssistant(assistant);
        } else if (ev.type === 'tool' && ev.phase === 'start') {
          this.lines = [...this.lines, { kind: 'tool', name: ev.name, text: ev.args ? JSON.stringify(ev.args).slice(0, 120) : '…' }];
        } else if (ev.type === 'error') {
          this.lines = [...this.lines, { kind: 'assistant', text: ev.message }];
        }
        this.stick();
      }
      if (!assistant) this._setAssistant(assistant || 'Done.');
    } catch {
      this.lines = [...this.lines, { kind: 'assistant', text: "Can't reach pi. Try again." }];
    } finally {
      this.busy = false;
      await this.load(fresh ? '' : this.sid);
    }
  }

  private remember() {
    try {
      if (this.sid) localStorage.setItem(STORE, this.sid);
      else localStorage.removeItem(STORE);
    } catch { /* private */ }
  }
  private stick() {
    queueMicrotask(() => {
      const el = this.log?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    });
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

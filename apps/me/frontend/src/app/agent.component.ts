import { Component, ElementRef, OnDestroy, OnInit, ViewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api, Standing } from './api';

type Line =
  | { kind: 'user'; text: string }
  | { kind: 'assistant'; text: string }
  | { kind: 'tool'; name: string; text: string };

@Component({
  selector: 'app-agent',
  imports: [FormsModule],
  styles: [`
    :host { display:flex; flex-direction:column; height:100%; min-height:0; overflow:hidden; background:var(--wall); padding:24px; box-sizing:border-box; position:relative; }
    .head { display:flex; align-items:center; justify-content:space-between; flex-shrink:0; gap:8px; }
    h1 { margin:0; font:var(--heading); }
    .head .actions { display:flex; gap:8px; }
    .qbtn.on { outline:2px solid var(--accent); }
    .log { margin-top:16px; flex:1; min-height:0; overflow-y:auto; overscroll-behavior:contain; display:flex; flex-direction:column; gap:12px; }
    .user, .assistant, .tool { margin:0; white-space:pre-wrap; overflow-wrap:anywhere; }
    .user { color:var(--accent); }
    .tool { color:var(--mute); font:var(--label); }
    .row { margin-top:16px; display:flex; gap:16px; flex-shrink:0; }
    textarea { flex:1; min-height:48px; max-height:64px; resize:none; border:0; background:var(--tile); color:var(--ink); padding:8px 16px; }
    .ask {
      position:absolute; top:72px; right:24px; width:320px; z-index:5;
      background:var(--tile); padding:16px; box-sizing:border-box;
    }
    .ask textarea { width:100%; margin-top:8px; flex:none; }
    .ask .row { margin-top:8px; }
    .mute { color:var(--mute); }
    pre { white-space:pre-wrap; font:var(--body); margin:0; }
  `],
  template: `
    <div class="head">
      <h1>Agent</h1>
      <div class="actions">
        <button class="hit" [disabled]="busy" (click)="onReset()">Reset</button>
        <button class="hit qbtn" [class.on]="askOpen" (click)="askOpen = !askOpen">Ask</button>
      </div>
    </div>
    @if (askOpen) {
      <div class="ask">
        <p>{{ cardText }}</p>
        @if (note && !reviewing) { <p class="mute">{{ note }}</p> }
        @if (mode === 'compose' || mode === 'proposing') {
          <textarea placeholder="Type an answer" [(ngModel)]="draft" (keydown.enter)="onAskEnter($event)"></textarea>
        }
        @if (reviewing && local.pending) {
          <pre>{{ local.pending.path }}
{{ local.pending.body }}</pre>
          @if (note) { <p class="mute">{{ note }}</p> }
          <div class="row">
            <button class="hit" [disabled]="mode==='writing'" (click)="onApprove()">Approve</button>
            <button class="hit text-hurt" [disabled]="mode==='writing'" (click)="onReject()">Reject</button>
          </div>
        } @else {
          <div class="row">
            <button class="hit" [disabled]="!canAnswer" (click)="onAnswer()">Answer</button>
            <button class="hit mute" [disabled]="mode==='proposing' || !local.qid" (click)="onSkip()">Skip</button>
          </div>
        }
      </div>
    }
    <div class="log" #log>
      @if (!lines.length) { <p class="text-mute">pi. Vault is /home/vivek/Deployments/Vault — it can read and write the whole folder.</p> }
      @for (l of lines; track $index) {
        @if (l.kind === 'user') { <pre class="user">{{ l.text }}</pre> }
        @else if (l.kind === 'tool') { <p class="tool">{{ l.name }} {{ l.text }}</p> }
        @else { <pre class="assistant">{{ l.text }}</pre> }
      }
    </div>
    <div class="row">
      <textarea placeholder="Tell the agent" [(ngModel)]="chatDraft" (keydown.enter)="onEnter($event)"></textarea>
      <button class="hit" [disabled]="!canSend" (click)="send()">Send</button>
    </div>
  `,
})
export class AgentComponent implements OnInit, OnDestroy {
  @ViewChild('log') log?: ElementRef<HTMLDivElement>;
  chatDraft = '';
  busy = false;
  lines: Line[] = [];
  askOpen = true;
  local: Standing = { status: 'idle', question: '', qid: '', pending: null };
  mode: 'idle' | 'compose' | 'proposing' | 'review' | 'writing' = 'idle';
  draft = '';
  note = '';
  private poll?: ReturnType<typeof setInterval>;

  constructor(private api: Api) {}

  get canSend() { return this.chatDraft.trim().length > 0 && !this.busy; }
  get reviewing() { return this.mode === 'review' || this.mode === 'writing'; }
  get canAnswer() { return !!this.local.qid && this.mode !== 'proposing' && (this.mode !== 'compose' || this.draft.trim().length > 0); }
  get cardText() {
    if (this.local.status === 'error') return this.local.message ?? "Can't load the question.";
    if (this.local.status === 'empty') return this.local.message ?? 'Thinking of a question…';
    return this.local.question;
  }

  async ngOnInit() {
    try {
      this.apply(await this.api.standing());
    } catch { /* leave empty; poll will retry */ }
    if (!this.local.qid) this.startPoll();
    try {
      const data = await this.api.agentHistory();
      this.lines = Array.isArray(data.lines) ? data.lines : [];
      this.stick();
    } catch { /* empty until first send */ }
  }
  ngOnDestroy() { this.stopPoll(); }

  onEnter(ev: Event) { ev.preventDefault(); void this.send(); }
  onAskEnter(ev: Event) { ev.preventDefault(); void this.submit(); }

  apply(s: Standing) {
    this.local = s;
    if (s.status === 'pending') this.mode = 'review';
    else if (this.mode !== 'compose' && this.mode !== 'proposing') this.mode = 'idle';
    if (s.qid || s.pending) {
      if (this.note === 'Thinking of a question…') this.note = '';
      this.stopPoll();
    } else {
      this.startPoll();
    }
  }

  async refresh() {
    try { this.apply(await this.api.standing()); } catch { /* keep last */ }
  }

  onAnswer() {
    if (this.mode === 'idle') { this.mode = 'compose'; return; }
    void this.submit();
  }
  async submit() {
    const text = this.draft.trim();
    if (!text || this.mode === 'proposing') return;
    this.mode = 'proposing';
    this.note = 'Writing a proposal…';
    try {
      const next = await this.api.standingPost(text);
      this.apply(next);
      if (next.status === 'refuse') {
        this.mode = 'compose';
        this.note = next.message ?? 'Company and SpaceX stay off this wall.';
        return;
      }
      if (next.status === 'pending') { this.mode = 'review'; this.note = ''; return; }
      this.mode = 'compose';
      this.note = "Can't draft the write. Try again.";
    } catch {
      this.mode = 'compose';
      this.note = "Can't draft the write. Try again.";
    }
  }
  async onSkip() {
    if (this.mode === 'proposing') return;
    this.note = 'Thinking of a question…';
    this.apply(await this.api.skip());
    this.draft = '';
    this.mode = 'idle';
  }
  async onApprove() {
    if (!this.local.pending || this.mode === 'writing') return;
    this.mode = 'writing';
    this.note = 'Writing the copy…';
    try {
      this.apply(await this.api.decide(this.local.pending.id, 'approve'));
      this.draft = '';
      this.note = '';
    } catch {
      this.mode = 'review';
      this.note = "Can't write the copy. Try again.";
    }
  }
  async onReject() {
    if (!this.local.pending || this.mode === 'writing') return;
    try {
      this.apply(await this.api.decide(this.local.pending.id, 'reject'));
      this.draft = '';
      this.note = '';
    } catch {
      this.mode = 'review';
      this.note = "Can't write the copy. Try again.";
    }
  }

  async onReset() {
    if (this.busy) return;
    try {
      await this.api.agentReset();
      this.lines = [];
    } catch { /* keep last */ }
  }

  async send() {
    const text = this.chatDraft.trim();
    if (!text || this.busy) return;
    this.chatDraft = '';
    this.busy = true;
    this.lines = [...this.lines, { kind: 'user', text }];
    this.stick();
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
        this.stick();
      }
      if (!assistant) this._setAssistant(assistant || 'Done.');
    } catch {
      this.lines = [...this.lines, { kind: 'assistant', text: "Can't reach pi. Try again." }];
    } finally {
      this.busy = false;
      this.stick();
    }
  }

  private startPoll() {
    if (this.poll) return;
    this.poll = setInterval(() => void this.refresh(), 2000);
  }
  private stopPoll() {
    if (!this.poll) return;
    clearInterval(this.poll);
    this.poll = undefined;
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

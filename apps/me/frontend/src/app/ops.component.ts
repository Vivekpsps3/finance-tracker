import { Component, Input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api, Standing } from './api';

@Component({
  selector: 'app-ops',
  imports: [FormsModule],
  styles: [`
    :host { display:block; height:100%; background:var(--wall); padding:24px; box-sizing:border-box; }
    .finance {
      display:flex; width:320px; height:160px; align-items:center; padding-left:24px;
      border-left:4px solid var(--accent); background:var(--tile); color:var(--ink);
      font:var(--display); text-decoration:none;
    }
    .card { margin-top:16px; width:calc(100% - 48px); background:var(--tile); padding:16px; overflow-y:auto; }
    textarea { width:100%; min-height:48px; max-height:64px; margin-top:8px; resize:none; border:0; background:var(--tile); color:var(--ink); }
    .row { display:flex; gap:16px; margin-top:8px; }
    .mute { color:var(--mute); }
    .sheet { position:absolute; inset:0; overflow-y:auto; background:var(--wall); padding:24px; }
    pre { white-space:pre-wrap; font:var(--body); }
  `],
  template: `
    <a class="finance" href="https://finance.vivekpanchagnula.com">Finance</a>
    <div class="card">
      <p>{{ cardText }}</p>
      @if (note && !reviewing) { <p class="mute">{{ note }}</p> }
      @if (mode === 'compose' || mode === 'proposing') {
        <textarea placeholder="Type an answer" [(ngModel)]="draft" (keydown.enter)="onEnter($event)"></textarea>
      }
      @if (!reviewing) {
        <div class="row">
          <button class="hit" [disabled]="!canAnswer" (click)="onAnswer()">Answer</button>
          <button class="hit mute" [disabled]="mode==='proposing'" (click)="onSkip()">Skip</button>
        </div>
      }
    </div>
    @if (reviewing && local.pending) {
      <div class="sheet">
        <p>{{ local.pending.path }}</p>
        <pre>{{ local.pending.path }}
{{ local.pending.body }}</pre>
        @if (note) { <p class="mute">{{ note }}</p> }
        <div class="row">
          <button class="hit" [disabled]="mode==='writing'" (click)="onApprove()">Approve</button>
          <button class="hit text-hurt" [disabled]="mode==='writing'" (click)="onReject()">Reject</button>
        </div>
      </div>
    }
  `,
})
export class OpsComponent {
  @Input() set standing(v: Standing) {
    this.local = v;
    this.mode = v.status === 'pending' ? 'review' : 'idle';
  }
  local: Standing = { status: 'idle', question: '', qid: '', pending: null };
  mode: 'idle' | 'compose' | 'proposing' | 'review' | 'writing' = 'idle';
  draft = '';
  note = '';

  constructor(private api: Api) {}

  get reviewing() { return this.mode === 'review' || this.mode === 'writing'; }
  get canAnswer() { return this.mode !== 'proposing' && (this.mode !== 'compose' || this.draft.trim().length > 0); }
  get cardText() {
    if (this.local.status === 'error') return this.local.message ?? "Can't load the question. Rebuild the index.";
    if (this.local.status === 'empty') return 'No question on the wall.';
    return this.local.question;
  }

  onEnter(ev: Event) {
    ev.preventDefault();
    void this.submit();
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
      this.local = next;
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
    this.local = await this.api.skip();
    this.mode = 'idle';
    this.draft = '';
    this.note = '';
  }
  async onApprove() {
    if (!this.local.pending || this.mode === 'writing') return;
    this.mode = 'writing';
    this.note = 'Writing the copy…';
    try {
      this.local = await this.api.decide(this.local.pending.id, 'approve');
      this.mode = 'idle';
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
      this.local = await this.api.decide(this.local.pending.id, 'reject');
      this.mode = 'idle';
      this.draft = '';
      this.note = '';
    } catch {
      this.mode = 'review';
      this.note = "Can't write the copy. Try again.";
    }
  }
}

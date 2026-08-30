import { Component, ElementRef, ViewChild, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Api, Standing, Timeline } from './api';
import { OpsComponent } from './ops.component';
import { MemoryComponent } from './memory.component';
import { AgentComponent } from './agent.component';

const WINDOWS = ['ops', 'memory', 'agent'] as const;
type WindowId = (typeof WINDOWS)[number];

@Component({
  selector: 'app-kiosk',
  imports: [OpsComponent, MemoryComponent, AgentComponent],
  styles: [`
    .shell { position:relative; height:100dvh; overflow:hidden; background:var(--wall); }
    nav {
      position:fixed; inset:0 0 auto 0; z-index:10; display:flex; height:64px; align-items:center;
      gap:16px; padding:0 24px; background:var(--tile);
    }
    nav button { border-bottom:4px solid transparent; background:transparent; color:var(--mute); }
    nav button.on { border-bottom-color:var(--accent); color:var(--ink); }
    nav button.theme { margin-left:auto; border-bottom:0; }
    .track {
      display:flex; height:100dvh; overflow-x:auto; overflow-y:hidden;
      scroll-snap-type:x mandatory; touch-action:pan-x; overscroll-behavior:none;
    }
    section { flex:0 0 100%; width:100%; height:100%; scroll-snap-align:start; scroll-snap-stop:always; padding-top:64px; box-sizing:border-box; }
  `],
  template: `
    <div class="shell">
      <nav>
        <button class="hit" [class.on]="active==='ops'" (click)="go('ops')">Ops</button>
        <button class="hit" [class.on]="active==='memory'" (click)="go('memory')">Memory</button>
        <button class="hit" [class.on]="active==='agent'" (click)="go('agent')">Agent</button>
        <button class="hit theme" type="button" (click)="toggleTheme()">{{ theme === 'dark' ? 'Light' : 'Dark' }}</button>
      </nav>
      <div class="track" #track (scroll)="onScroll()">
        <section><app-ops [standing]="standing" /></section>
        <section><app-memory [timeline]="timeline" /></section>
        <section><app-agent /></section>
      </div>
    </div>
  `,
})
export class KioskComponent {
  private api = inject(Api);
  private router = inject(Router);
  @ViewChild('track') track?: ElementRef<HTMLDivElement>;
  active: WindowId = 'ops';
  theme: 'light' | 'dark' = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  timeline: Timeline | null = null;
  standing: Standing = { status: 'idle', question: '', qid: '', pending: null };

  toggleTheme() {
    this.theme = this.theme === 'dark' ? 'light' : 'dark';
    try {
      localStorage.setItem('me-theme', this.theme);
    } catch {
      /* private mode */
    }
    document.documentElement.setAttribute('data-theme', this.theme);
  }

  async ngOnInit() {
    try {
      const data = await this.api.bootstrap();
      this.timeline = data.timeline;
      this.standing = data.standing;
    } catch {
      await this.router.navigateByUrl('/login');
    }
  }

  go(id: WindowId) {
    const el = this.track?.nativeElement;
    if (!el) return;
    const i = WINDOWS.indexOf(id);
    this.active = id;
    el.scrollTo({ left: i * el.clientWidth, behavior: 'auto' });
  }

  onScroll() {
    const el = this.track?.nativeElement;
    if (!el || el.clientWidth <= 0) return;
    const i = Math.min(2, Math.max(0, Math.round(el.scrollLeft / el.clientWidth)));
    this.active = WINDOWS[i];
  }
}

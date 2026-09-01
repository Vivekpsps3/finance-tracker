import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Api, Timeline } from './api';
import { OpsComponent } from './ops.component';
import { MemoryComponent } from './memory.component';
import { AgentComponent } from './agent.component';
import { clock } from './cal';

type WindowId = 'ops' | 'memory' | 'agent';

@Component({
  selector: 'app-kiosk',
  imports: [OpsComponent, MemoryComponent, AgentComponent],
  template: `
    <div class="kiosk">
      <nav class="kiosk-nav">
        <span class="mark">me</span>
        <button class="tab" [class.on]="active==='ops'" (click)="active='ops'">Ops</button>
        <button class="tab" [class.on]="active==='memory'" (click)="active='memory'">Memory</button>
        <button class="tab" [class.on]="active==='agent'" (click)="active='agent'">Agent</button>
        <div class="end">
          <span class="live">{{ time }}</span>
          <div class="vivek-nav__theme" role="group" aria-label="Color mode">
            <button type="button" [class.on]="theme !== 'dark'" (click)="setTheme('light')">Light</button>
            <button type="button" [class.on]="theme === 'dark'" (click)="setTheme('dark')">Dark</button>
          </div>
        </div>
      </nav>
      <main class="kiosk-stage">
        <app-ops [class.off]="active !== 'ops'" [timeline]="timeline" />
        <app-memory [class.off]="active !== 'memory'" [timeline]="timeline" />
        <app-agent [class.off]="active !== 'agent'" />
      </main>
    </div>
  `,
})
export class KioskComponent implements OnInit, OnDestroy {
  private api = inject(Api);
  private router = inject(Router);
  active: WindowId = 'memory';
  theme: 'light' | 'dark' = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  timeline: Timeline | null = null;
  time = clock();
  private tick?: ReturnType<typeof setInterval>;

  setTheme(theme: 'light' | 'dark') {
    this.theme = theme;
    try { localStorage.setItem('me-theme', theme); } catch { /* private */ }
    document.documentElement.setAttribute('data-theme', theme);
  }

  async ngOnInit() {
    this.tick = setInterval(() => (this.time = clock()), 15000);
    try {
      const data = await this.api.bootstrap();
      this.timeline = data.timeline;
    } catch {
      await this.router.navigateByUrl('/login');
    }
  }
  ngOnDestroy() { if (this.tick) clearInterval(this.tick); }
}

import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { Api, Standing, Timeline } from './api';
import { OpsComponent } from './ops.component';
import { MemoryComponent } from './memory.component';
import { AgentComponent } from './agent.component';

type WindowId = 'ops' | 'memory' | 'agent';

@Component({
  selector: 'app-kiosk',
  imports: [OpsComponent, MemoryComponent, AgentComponent],
  styles: [`
    .shell { position:relative; height:100dvh; overflow:hidden; background:var(--wall); }
    nav {
      position:fixed; inset:0 0 auto 0; z-index:10; display:flex; height:64px; align-items:center;
      gap:8px; padding:0 24px; background:var(--tile); border-bottom:1px solid var(--border-subtle);
    }
    nav button.hit { background:transparent; border-radius:var(--radius-md); padding:0 var(--space-3); color:var(--mute); }
    nav button.hit.on { background:var(--surface-2); color:var(--ink); }
    nav .theme { margin-left:auto; }
    main { height:100dvh; padding-top:64px; box-sizing:border-box; }
    main > * { display:block; height:100%; }
  `],
  template: `
    <div class="shell">
      <nav>
        <button class="hit" [class.on]="active==='ops'" (click)="active='ops'">Ops</button>
        <button class="hit" [class.on]="active==='memory'" (click)="active='memory'">Memory</button>
        <button class="hit" [class.on]="active==='agent'" (click)="active='agent'">Agent</button>
        <div class="vivek-nav__theme theme" role="group" aria-label="Color mode">
          <button type="button" [class.on]="theme !== 'dark'" (click)="setTheme('light')">Light</button>
          <button type="button" [class.on]="theme === 'dark'" (click)="setTheme('dark')">Dark</button>
        </div>
      </nav>
      <main>
        @switch (active) {
          @case ('ops') { <app-ops [standing]="standing" /> }
          @case ('memory') { <app-memory [timeline]="timeline" /> }
          @case ('agent') { <app-agent /> }
        }
      </main>
    </div>
  `,
})
export class KioskComponent {
  private api = inject(Api);
  private router = inject(Router);
  active: WindowId = 'ops';
  theme: 'light' | 'dark' = document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  timeline: Timeline | null = null;
  standing: Standing = { status: 'idle', question: '', qid: '', pending: null };

  setTheme(theme: 'light' | 'dark') {
    this.theme = theme;
    try {
      localStorage.setItem('me-theme', theme);
    } catch {
      /* private mode */
    }
    document.documentElement.setAttribute('data-theme', theme);
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
}

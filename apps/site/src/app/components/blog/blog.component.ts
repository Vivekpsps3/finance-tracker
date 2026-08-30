import { Component } from '@angular/core';

@Component({
  selector: 'app-blog',
  standalone: true,
  template: `
    <main class="page">
      <header class="ui-page-header">
        <div>
          <h1 class="ui-page-header__title">Blog</h1>
          <p class="ui-page-header__subtitle">Nothing published yet.</p>
        </div>
      </header>
      <section class="ui-card">
        <p>When there is something to say, it will land here.</p>
      </section>
    </main>
  `,
})
export class BlogComponent {}

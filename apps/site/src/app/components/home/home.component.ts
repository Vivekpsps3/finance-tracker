import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [RouterLink],
  template: `
    <main class="page">
      <header class="ui-page-header">
        <div>
          <h1 class="ui-page-header__title">Vivek Panchagnula</h1>
          <p class="ui-page-header__subtitle">Computer engineer. AI and systems.</p>
        </div>
      </header>
      <section class="ui-card">
        <p>Resume, writing, and a public crypto demo.</p>
        <p class="links">
          <a routerLink="/about">About</a>
          <a routerLink="/blog">Blog</a>
          <a routerLink="/secrets">Project Secrets</a>
        </p>
      </section>
    </main>
  `,
})
export class HomeComponent {}

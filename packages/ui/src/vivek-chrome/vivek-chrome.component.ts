import { Component, input } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

export type VivekTab = { label: string; shortLabel?: string; path: string };
export type VivekCrossLink = { label: string; href: string };

const THEME_KEY = 'vivek-theme';
const LEGACY_KEY = 'ft-theme';

@Component({
  selector: 'vivek-chrome',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './vivek-chrome.component.html',
  styleUrl: './vivek-chrome.component.css',
  })
export class VivekChromeComponent {
  logo = input('Vivek');
  tabs = input<VivekTab[]>([]);
  crossLinks = input<VivekCrossLink[]>([]);
  showTheme = input(true);

  constructor() {
    this.apply(this.readTheme());
  }

  theme(): 'light' | 'dark' {
    return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }

  setTheme(next: 'light' | 'dark'): void {
    localStorage.setItem(THEME_KEY, next);
    this.apply(next);
  }

  private readTheme(): 'light' | 'dark' {
    const stored = localStorage.getItem(THEME_KEY) || localStorage.getItem(LEGACY_KEY);
    if (stored === 'light' || stored === 'dark') return stored;
    return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }

  private apply(theme: 'light' | 'dark'): void {
    document.documentElement.setAttribute('data-theme', theme);
  }
}

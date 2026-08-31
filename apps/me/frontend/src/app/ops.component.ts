import { Component } from '@angular/core';

@Component({
  selector: 'app-ops',
  styles: [`
    :host { display:block; height:100%; background:var(--wall); padding:24px; box-sizing:border-box; }
    iframe {
      width:min(420px, 100%); height:min(520px, 100%); border:0; background:var(--tile);
    }
  `],
  template: `<iframe title="Net worth" src="https://finance.vivekpanchagnula.com/embed"></iframe>`,
})
export class OpsComponent {}

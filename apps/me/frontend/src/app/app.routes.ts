import { Routes } from '@angular/router';
import { LoginComponent } from './login.component';
import { KioskComponent } from './kiosk.component';

export const routes: Routes = [
  { path: 'login', component: LoginComponent },
  { path: '', component: KioskComponent },
  { path: '**', redirectTo: '' },
];

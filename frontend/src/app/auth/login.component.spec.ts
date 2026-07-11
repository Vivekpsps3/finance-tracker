import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { LoginComponent } from './login.component';
import { AuthService } from './auth.service';

describe('LoginComponent', () => {
  it('marks for check when passwordless setup begins and fails asynchronously', async () => {
    const auth = jasmine.createSpyObj('AuthService', ['bootstrapPasswordless']);
    auth.bootstrapPasswordless.and.returnValue(Promise.reject(new Error('Setup failed')));
    TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [
        { provide: AuthService, useValue: auth },
        { provide: Router, useValue: jasmine.createSpyObj('Router', ['navigate']) },
      ],
    });
    const fixture: ComponentFixture<LoginComponent> = TestBed.createComponent(LoginComponent);
    const component = fixture.componentInstance;
    const cdr = (component as any).cdr as jasmine.SpyObj<{ markForCheck(): void }>;
    spyOn(cdr, 'markForCheck');
    component.setupMode = true;
    component.username = 'admin';
    component.displayName = 'Admin';
    component.password = 'long enough passphrase';

    component.submit();
    await Promise.resolve();
    await Promise.resolve();

    expect(component.error).toBe('Setup failed');
    expect(cdr.markForCheck).toHaveBeenCalled();
  });
});

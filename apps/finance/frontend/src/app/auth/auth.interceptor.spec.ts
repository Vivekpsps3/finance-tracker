import { HttpErrorResponse, HttpRequest } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { firstValueFrom, throwError } from 'rxjs';
import { authInterceptor } from './auth.interceptor';
import { AuthService } from './auth.service';

describe('authInterceptor', () => {
  function runInterceptor(url: string) {
    return TestBed.runInInjectionContext(() =>
      authInterceptor(
        new HttpRequest('POST', url, {}),
        () => throwError(() => new HttpErrorResponse({ status: 401, statusText: 'Unauthorized', url }))
      )
    );
  }

  it('does not navigate away from passwordless auth failures so the login form can show an error', async () => {
    const auth = jasmine.createSpyObj('AuthService', ['clearLocalSession'], { csrfToken: null });
    const router = jasmine.createSpyObj('Router', ['navigate']);
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: auth },
        { provide: Router, useValue: router },
      ],
    });

    await expectAsync(firstValueFrom(runInterceptor('/api/auth/passwordless/verify'))).toBeRejected();
    expect(auth.clearLocalSession).not.toHaveBeenCalled();
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('still clears the session for authenticated API 401 responses', async () => {
    const auth = jasmine.createSpyObj('AuthService', ['clearLocalSession'], { csrfToken: null });
    const router = jasmine.createSpyObj('Router', ['navigate']);
    TestBed.configureTestingModule({
      providers: [
        { provide: AuthService, useValue: auth },
        { provide: Router, useValue: router },
      ],
    });

    await expectAsync(firstValueFrom(runInterceptor('/api/vault/status'))).toBeRejected();
    expect(auth.clearLocalSession).toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(['/login']);
  });
});

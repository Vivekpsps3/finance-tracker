import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AdminUsersComponent } from './admin-users.component';
import { AuthService } from '../../auth/auth.service';

describe('AdminUsersComponent', () => {
  let fixture: ComponentFixture<AdminUsersComponent>;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [AdminUsersComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), { provide: AuthService, useValue: {} }],
    });
    fixture = TestBed.createComponent(AdminUsersComponent);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('marks for check when an asynchronous user load succeeds', () => {
    const component = fixture.componentInstance;
    const cdr = (component as any).cdr as jasmine.SpyObj<{ markForCheck(): void }>;
    spyOn(cdr, 'markForCheck');

    component.loadUsers();
    http.expectOne('/api/admin/users').flush([]);

    expect(cdr.markForCheck).toHaveBeenCalled();
    expect(component.usersLoading).toBeFalse();
  });
});

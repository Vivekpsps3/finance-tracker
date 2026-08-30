import { TestBed } from '@angular/core/testing';

import { EcdhService } from './ecdh.service';

describe('EcdhService', () => {
  let service: EcdhService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(EcdhService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});

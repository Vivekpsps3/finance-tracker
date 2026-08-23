import { PortfolioComponent } from './portfolio.component';

describe('PortfolioComponent', () => {
  it('refreshes all prices through FinanceService', () => {
    const finance = jasmine.createSpyObj('FinanceService', ['refreshAllHoldingPrices']);
    finance.refreshAllHoldingPrices.and.returnValue({ pipe: () => ({ subscribe: () => {} }) });
    const toast = jasmine.createSpyObj('ToastService', ['success']);
    const component = new PortfolioComponent(finance, toast, {} as any, {} as any);

    component.refreshAllPrices();

    expect(finance.refreshAllHoldingPrices).toHaveBeenCalled();
  });
});

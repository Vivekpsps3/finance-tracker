import { PortfolioComponent } from './portfolio.component';

describe('PortfolioComponent', () => {
  it('does not claim a vault holding price was refreshed', () => {
    const finance = jasmine.createSpyObj('FinanceService', ['refreshAllHoldingPrices']);
    finance.canRefreshHoldingPrices = false;
    const toast = jasmine.createSpyObj('ToastService', ['success']);
    const component = new PortfolioComponent(finance, toast, {} as any, {} as any);

    component.refreshAllPrices();

    expect(finance.refreshAllHoldingPrices).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
    expect(component.lastPortfolioRefresh).toBeNull();
  });

  it('does not claim an individual vault holding price was refreshed', () => {
    const finance = jasmine.createSpyObj('FinanceService', ['refreshHoldingPrice']);
    finance.canRefreshHoldingPrices = false;
    const toast = jasmine.createSpyObj('ToastService', ['success']);
    const component = new PortfolioComponent(finance, toast, {} as any, {} as any);

    component.refreshHoldingPrice({
      id: 1,
      symbol: 'AAPL',
      shares: 1,
      purchase_price: 100,
      purchase_date: '2026-01-01',
    });

    expect(finance.refreshHoldingPrice).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });
});

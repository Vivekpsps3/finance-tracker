import { ElementRef } from '@angular/core';
import { InvestmentInsightsComponent } from './investment-insights.component';

describe('InvestmentInsightsComponent', () => {
  const createComponent = () =>
    new InvestmentInsightsComponent({} as any, { markForCheck: () => undefined } as any);

  it('uses 7% annual growth initially and after reset', () => {
    const component = createComponent();

    expect(component.annualGrowthRate).toBe(7);
    component.annualGrowthRate = 12;
    component.resetAssumptions();
    expect(component.annualGrowthRate).toBe(7);
  });

  it('renders when the conditional projection canvas is attached', () => {
    const component = createComponent();
    const render = spyOn<any>(component, 'renderProjectionChart');

    component.projectionChartCanvas = new ElementRef(document.createElement('canvas'));

    expect(render).toHaveBeenCalled();
  });
});

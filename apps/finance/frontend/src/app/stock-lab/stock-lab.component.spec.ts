import { Subject } from 'rxjs';
import { StockLabComponent } from './stock-lab.component';

describe('StockLabComponent', () => {
  it('ignores a slower prior market response after the selected symbol changes', () => {
    const first = new Subject<any>();
    const second = new Subject<any>();
    const market = jasmine.createSpyObj('MarketResearchService', ['getBatch']);
    market.getBatch.and.returnValues(first, second);
    const scenarios = jasmine.createSpyObj('StockLabScenarioService', ['createDefaultScenario']);
    scenarios.createDefaultScenario.and.returnValue({
      id: 0, primary_symbol: 'VOO', comparison_symbols: [], selected_owned_symbols: [],
      include_owned_symbols: false,
    });
    const finance = { holdings$: new Subject<any>() };
    const cdr = jasmine.createSpyObj('ChangeDetectorRef', ['markForCheck']);
    const component = new StockLabComponent(market, scenarios, finance as any, {} as any, cdr);

    component.loadMarketData(false);
    component.setPrimarySymbol('SCHD');
    component.loadMarketData(false);
    second.next({ results: [{ symbol: 'SCHD' }], failed: [] });
    first.next({ results: [{ symbol: 'VOO' }], failed: [] });

    expect(component.research.map(row => row.symbol)).toEqual(['SCHD']);
  });
});

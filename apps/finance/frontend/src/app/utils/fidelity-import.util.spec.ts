import {
  buildFidelityImportPreview,
  commitFidelityImportRows,
  listClientBrokerageImports,
  parseFidelityCsv,
} from './fidelity-import.util';

const SAMPLE_CSV = [
  'Account Number,Account Name,Symbol,Description,Quantity,Average Cost Basis',
  'Z111,Individual,SPAXX**,CASH,,,',
  'Z111,Individual,VOO,VOO ETF,2,$500.00',
  'Z222,Roth IRA,VT,VT ETF,1,100',
].join('\n');

describe('fidelity-import util', () => {
  it('lists Fidelity as the client-side brokerage importer', () => {
    expect(listClientBrokerageImports().map(b => b.slug)).toEqual(['fidelity']);
  });

  it('parses Fidelity positions and skips zero-quantity cash rows', () => {
    const rows = parseFidelityCsv(SAMPLE_CSV);
    expect(rows.map(r => r.symbol).sort()).toEqual(['VOO', 'VT']);
    const voo = rows.find(r => r.symbol === 'VOO')!;
    expect(voo.account_mask).toBe('Z111');
    expect(voo.shares).toBe(2);
    expect(voo.avg_cost_basis).toBe(500);
  });

  it('builds a replace preview without backend calls', () => {
    const preview = buildFidelityImportPreview('fidelity.csv', SAMPLE_CSV);
    expect(preview.broker).toBe('Fidelity');
    expect(preview.summary).toEqual({ accounts: 2, positions: 2, total_cost: 1100 });
    expect(preview.accounts).toEqual(['Fidelity ···Z111', 'Fidelity ···Z222']);
    expect(preview.rows[0]).toEqual(
      jasmine.objectContaining({
        account_mask: 'Z111',
        account_display: 'Fidelity ···Z111',
        symbol: 'VOO',
        status: 'replace',
      })
    );
  });

  it('replaces holdings only for selected Fidelity accounts', async () => {
    const accounts: any[] = [];
    const holdings: any[] = [
      {
        id: 1,
        symbol: 'OLD',
        shares: 1,
        purchase_price: 10,
        purchase_date: '2020-01-01',
        brokerage_account_id: 9,
        account_display: 'Fidelity ···Z111',
      },
      {
        id: 2,
        symbol: 'KEEP',
        shares: 3,
        purchase_price: 20,
        purchase_date: '2020-01-01',
        brokerage_account_id: 10,
        account_display: 'Fidelity ···OTHER',
      },
    ];
    const store = {
      getHoldings: jasmine.createSpy().and.callFake(async () => holdings.slice()),
      getBrokerageAccounts: jasmine.createSpy().and.callFake(async () => accounts.slice()),
      upsertBrokerageAccount: jasmine.createSpy().and.callFake(async (body: any) => {
        const row = { id: accounts.length + 1, ...body };
        accounts.push(row);
        return row;
      }),
      deleteHolding: jasmine.createSpy().and.callFake(async (id: number) => {
        const idx = holdings.findIndex(h => h.id === id);
        if (idx >= 0) holdings.splice(idx, 1);
      }),
      addHolding: jasmine.createSpy().and.callFake(async (body: any) => {
        const row = { id: 100 + holdings.length, ...body };
        holdings.push(row);
        return row;
      }),
    };

    // Seed existing account ids used by holdings
    accounts.push(
      {
        id: 9,
        broker_slug: 'fidelity',
        broker_name: 'Fidelity',
        account_mask: 'Z111',
        label: 'Fidelity ···Z111',
      },
      {
        id: 10,
        broker_slug: 'fidelity',
        broker_name: 'Fidelity',
        account_mask: 'OTHER',
        label: 'Fidelity ···OTHER',
      }
    );

    const preview = buildFidelityImportPreview('fidelity.csv', SAMPLE_CSV);
    const selected = preview.rows.filter(r => r.account_mask === 'Z111');
    const result = await commitFidelityImportRows(store, selected);

    expect(result.accounts_replaced).toBe(1);
    expect(result.holdings_replaced).toBe(1);
    expect(result.inserted).toBe(1);
    expect(holdings.map(h => h.symbol).sort()).toEqual(['KEEP', 'VOO']);
    expect(store.addHolding).toHaveBeenCalledWith(
      jasmine.objectContaining({
        symbol: 'VOO',
        shares: 2,
        purchase_price: 500,
        brokerage_account_id: 9,
        account_display: 'Fidelity ···Z111',
        price_source: 'import',
      })
    );
  });

  it('deletes legacy Fidelity holdings matched by account display when account ids diverge', async () => {
    const accounts: any[] = [];
    const holdings: any[] = [
      {
        id: 1,
        symbol: 'OLD1',
        shares: 1,
        purchase_price: 10,
        purchase_date: '2020-01-01',
        brokerage_account_id: 77, // orphaned legacy id
        account_display: 'Fidelity ···Z111',
      },
      {
        id: 2,
        symbol: 'OLD2',
        shares: 4,
        purchase_price: 20,
        purchase_date: '2020-01-01',
        // no brokerage_account_id, only display label
        account_display: 'Fidelity ···Z111',
      },
      {
        id: 3,
        symbol: 'KEEP',
        shares: 1,
        purchase_price: 5,
        purchase_date: '2020-01-01',
        account_display: 'Manual',
      },
    ];
    const store = {
      getHoldings: jasmine.createSpy().and.callFake(async () => holdings.slice()),
      getBrokerageAccounts: jasmine.createSpy().and.resolveTo([]),
      upsertBrokerageAccount: jasmine.createSpy().and.callFake(async (body: any) => {
        const row = { id: 100, ...body };
        accounts.push(row);
        return row;
      }),
      deleteHolding: jasmine.createSpy().and.callFake(async (id: number) => {
        const idx = holdings.findIndex(h => h.id === id);
        if (idx >= 0) holdings.splice(idx, 1);
      }),
      addHolding: jasmine.createSpy().and.callFake(async (body: any) => {
        const row = { id: 200 + holdings.length, ...body };
        holdings.push(row);
        return row;
      }),
    };

    const preview = buildFidelityImportPreview('fidelity.csv', SAMPLE_CSV);
    const selected = preview.rows.filter(r => r.account_mask === 'Z111');
    const result = await commitFidelityImportRows(store, selected);

    expect(result.holdings_replaced).toBe(2);
    expect(result.inserted).toBe(1);
    expect(holdings.map(h => h.symbol).sort()).toEqual(['KEEP', 'VOO']);
    expect(store.deleteHolding).toHaveBeenCalledWith(1);
    expect(store.deleteHolding).toHaveBeenCalledWith(2);
  });
});

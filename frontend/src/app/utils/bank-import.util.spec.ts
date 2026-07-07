import {
  buildBankImportPreview,
  commitBankImportRows,
  listClientBankImports,
} from './bank-import.util';

describe('bank-import util', () => {
  it('lists supported client-side bank CSV importers', () => {
    expect(listClientBankImports().map(b => b.slug)).toEqual([
      'capital_one',
      'chase',
      'amex',
      'citi',
      'x_money',
    ]);
  });

  it('previews Capital One expenses without sending CSV to the backend', async () => {
    const csv = [
      'Transaction Date,Posted Date,Card No.,Description,Category,Debit,Credit',
      '2026-01-02,2026-01-03,1234,COSTCO GAS,Gas,42.12,',
      '2026-01-04,2026-01-05,1234,PAYMENT,Payment,,42.12',
    ].join('\n');

    const preview = await buildBankImportPreview('capital_one', 'capital.csv', csv, new Set());

    expect(preview.bank).toBe('Capital One');
    expect(preview.summary).toEqual({ total_parsed: 1, new: 1, duplicate: 0 });
    expect(preview.rows[0]).toEqual(
      jasmine.objectContaining({
        date: '2026-01-02',
        account_mask: '1234',
        account_display: 'Capital One ···1234',
        description: 'COSTCO GAS',
        category: 'Costco',
        amount: 42.12,
        status: 'new',
      })
    );
    expect(preview.rows[0].dedupe_key).toMatch(/^[a-f0-9]{64}$/);
  });

  it('marks existing and same-file duplicate rows during preview', async () => {
    const csv = [
      'Transaction Date,Post Date,Description,Category,Type,Amount,Memo',
      '01/02/2026,01/03/2026,Groceries,Food,Sale,-10.00,',
      '01/02/2026,01/03/2026,Groceries,Food,Sale,-10.00,',
    ].join('\n');
    const first = await buildBankImportPreview('chase', 'chase.csv', csv, new Set());
    const existing = new Set([first.rows[0].dedupe_key]);

    const second = await buildBankImportPreview('chase', 'chase.csv', csv, existing);

    expect(first.summary).toEqual({ total_parsed: 2, new: 1, duplicate: 1 });
    expect(second.summary).toEqual({ total_parsed: 2, new: 0, duplicate: 2 });
  });

  it('commits only non-duplicate preview rows as encrypted expense transactions', async () => {
    const added: any[] = [];
    const store = {
      getTransactions: jasmine.createSpy().and.resolveTo([]),
      addTransaction: jasmine.createSpy().and.callFake(async row => {
        added.push(row);
        return { ...row, id: added.length };
      }),
    };
    const preview = await buildBankImportPreview(
      'amex',
      'amex.csv',
      ['Date,Description,Account #,Amount,Category', '01/02/2026,Coffee,-1001,8.50,Food'].join('\n'),
      new Set()
    );

    const result = await commitBankImportRows(store, preview.rows);

    expect(result).toEqual({ inserted: 1, skipped: 0, batch_id: 0 });
    expect(store.addTransaction).toHaveBeenCalledOnceWith(
      jasmine.objectContaining({
        date: '2026-01-02',
        type: 'expense',
        category: 'Food',
        amount: 8.5,
        description: 'Coffee',
        source: 'import',
        account_display: 'American Express ···1001',
        dedupe_key: preview.rows[0].dedupe_key,
      })
    );
  });
});

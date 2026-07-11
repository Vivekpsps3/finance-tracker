import {
  FidelityCommitResult,
  FidelityImportOption,
  FidelityPreviewResult,
  FidelityPreviewRow,
  Holding,
} from '../models/transaction.model';

export interface BrokerageAccountRecord {
  id: number;
  broker_slug: string;
  broker_name: string;
  account_mask: string;
  account_name?: string;
  nickname?: string | null;
  label?: string | null;
}

export interface EncryptedFidelityStore {
  getHoldings(): Promise<Holding[]>;
  getBrokerageAccounts(): Promise<BrokerageAccountRecord[]>;
  upsertBrokerageAccount(
    body: Omit<BrokerageAccountRecord, 'id'> & { id?: number }
  ): Promise<BrokerageAccountRecord>;
  deleteHolding(id: number): Promise<void>;
  addHolding(body: any): Promise<Holding>;
}

interface ParsedFidelityRow {
  account_mask: string;
  account_name: string;
  symbol: string;
  shares: number;
  avg_cost_basis: number;
  cost_basis_total: number;
}

const FIDELITY_OPTION: FidelityImportOption = {
  slug: 'fidelity',
  name: 'Fidelity',
  hint:
    'Fidelity positions CSV (Account Number, Account Name, Symbol, Quantity, Average Cost Basis). Import replaces existing positions for accounts found in the file.',
  file_extensions: ['.csv'],
};

const REQUIRED_HEADERS = [
  'account number',
  'account name',
  'symbol',
  'quantity',
  'average cost basis',
];

export function listClientBrokerageImports(): FidelityImportOption[] {
  return [FIDELITY_OPTION];
}

export function buildFidelityImportPreview(filename: string, content: string): FidelityPreviewResult {
  const parsed = parseFidelityCsv(content);
  const byAccount = new Map<string, ParsedFidelityRow[]>();
  for (const row of parsed) {
    const list = byAccount.get(row.account_mask) || [];
    list.push(row);
    byAccount.set(row.account_mask, list);
  }

  const accounts: string[] = [];
  const rows: FidelityPreviewRow[] = [];
  let totalCost = 0;
  for (const [mask, accountRows] of byAccount) {
    const display = accountDisplay(mask);
    accounts.push(display);
    for (const row of accountRows) {
      rows.push({
        account_mask: mask,
        account_display: display,
        symbol: row.symbol,
        shares: row.shares,
        avg_cost_basis: row.avg_cost_basis,
        cost_basis_total: row.cost_basis_total,
        status: 'replace',
      });
      totalCost += row.cost_basis_total;
    }
  }

  return {
    broker: FIDELITY_OPTION.name,
    filename,
    accounts,
    rows,
    summary: {
      accounts: byAccount.size,
      positions: rows.length,
      total_cost: roundMoney(totalCost),
    },
  };
}

export async function commitFidelityImportRows(
  store: EncryptedFidelityStore,
  rows: FidelityPreviewRow[]
): Promise<FidelityCommitResult> {
  if (!rows.length) {
    return { accounts_replaced: 0, holdings_replaced: 0, inserted: 0, accounts: [] };
  }

  const masks = Array.from(new Set(rows.map(row => row.account_mask).filter(Boolean)));
  const existingAccounts = await store.getBrokerageAccounts();
  const accountByMask = new Map(
    existingAccounts
      .filter(acc => acc.broker_slug === 'fidelity')
      .map(acc => [acc.account_mask, acc] as const)
  );

  const accMap = new Map<string, BrokerageAccountRecord>();
  const accountDisplays: string[] = [];
  for (const mask of masks) {
    let acc = accountByMask.get(mask);
    if (!acc) {
      const label = accountDisplay(mask);
      acc = await store.upsertBrokerageAccount({
        broker_slug: 'fidelity',
        broker_name: 'Fidelity',
        account_mask: mask,
        account_name: mask,
        nickname: null,
        label,
      });
    }
    accMap.set(mask, acc);
    accountDisplays.push(displayForAccount(acc));
  }

  const holdings = await store.getHoldings();
  const replacedIds = new Set(
    holdings
      .filter(h => h.brokerage_account_id != null && Array.from(accMap.values()).some(a => a.id === h.brokerage_account_id))
      .map(h => h.id)
  );
  for (const id of replacedIds) {
    await store.deleteHolding(id);
  }

  const purchaseDate = todayIso();
  let inserted = 0;
  for (const row of rows) {
    const acc = accMap.get(row.account_mask);
    if (!acc) continue;
    await store.addHolding({
      symbol: row.symbol.toUpperCase().trim(),
      shares: roundShares(row.shares),
      purchase_price: roundCost(row.avg_cost_basis || 0),
      purchase_date: purchaseDate,
      current_price: roundCost(row.avg_cost_basis || 0),
      price_source: 'import',
      brokerage_account_id: acc.id,
      account_display: displayForAccount(acc),
    });
    inserted += 1;
  }

  return {
    accounts_replaced: masks.length,
    holdings_replaced: replacedIds.size,
    inserted,
    accounts: accountDisplays,
  };
}

export function parseFidelityCsv(content: string): ParsedFidelityRow[] {
  const { header, rows } = readCsvWithHeader(content, REQUIRED_HEADERS);
  const out: ParsedFidelityRow[] = [];
  for (const { row } of rows) {
    const accountMask = (row[header['account number']] || '').trim();
    const accountName = (row[header['account name']] || '').trim() || accountMask;
    const symbol = (row[header['symbol']] || '').trim().toUpperCase().replace(/\*\*/g, '');
    const shares = parseAmount(row[header['quantity']]);
    const avgCost = parseAmount(row[header['average cost basis']]);
    if (!accountMask || shares <= 0 || !symbol) continue;
    out.push({
      account_mask: accountMask,
      account_name: accountName,
      symbol,
      shares: roundShares(shares),
      avg_cost_basis: avgCost > 0 ? roundCost(avgCost) : 0,
      cost_basis_total: roundMoney(shares * (avgCost > 0 ? avgCost : 0)),
    });
  }
  return out;
}

function accountDisplay(mask: string): string {
  return `Fidelity ···${mask}`;
}

function displayForAccount(acc: BrokerageAccountRecord): string {
  if (acc.nickname?.trim()) return acc.nickname.trim();
  if (acc.label?.trim()) return acc.label.trim();
  return accountDisplay(acc.account_mask);
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function readCsvWithHeader(content: string, required: string[]) {
  const records = parseCsv(content.replace(/^\ufeff/, ''));
  if (!records.length) throw new Error('CSV file is empty');
  const names = records[0].map(cell => cell.trim().toLowerCase());
  const missing = required.filter(name => !names.includes(name));
  if (missing.length) throw new Error(`Missing required columns: ${missing.sort().join(', ')}`);
  const header: Record<string, number> = {};
  names.forEach((name, index) => {
    header[name] = index;
  });
  const rows = records
    .slice(1)
    .map((row, index) => ({ row: padRow(row, names.length), lineNo: index + 2 }))
    .filter(({ row }) => row.some(cell => cell.trim()));
  return { header, rows };
}

function parseCsv(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;
  for (let i = 0; i < content.length; i += 1) {
    const ch = content[i];
    if (ch === '"') {
      if (inQuotes && content[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      row.push(cell);
      cell = '';
    } else if ((ch === '\n' || ch === '\r') && !inQuotes) {
      if (ch === '\r' && content[i + 1] === '\n') i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function padRow(row: string[], length: number): string[] {
  return row.length >= length ? row : [...row, ...Array.from({ length: length - row.length }, () => '')];
}

function parseAmount(raw: string): number {
  let value = (raw || '').trim().replace(/[$,]/g, '');
  if (!value) return 0;
  if (value.startsWith('(') && value.endsWith(')')) value = `-${value.slice(1, -1)}`;
  return Number(value) || 0;
}

function roundMoney(value: number): number {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function roundCost(value: number): number {
  return Math.round((Number(value) || 0) * 10000) / 10000;
}

function roundShares(value: number): number {
  return Math.round((Number(value) || 0) * 1_000_000) / 1_000_000;
}

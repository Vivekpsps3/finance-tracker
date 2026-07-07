import {
  BankImportOption,
  ImportCommitResult,
  ImportPreviewResult,
  ImportPreviewRow,
  Transaction,
} from '../models/transaction.model';

interface ParsedBankRow {
  date: string;
  account_mask: string;
  description: string;
  category: string;
  amount: number;
  dedupe_key: string;
}

interface BankImporter {
  slug: string;
  name: string;
  hint: string;
  file_extensions: string[];
  parse(content: string): Promise<ParsedBankRow[]>;
}

interface EncryptedImportStore {
  getTransactions(): Promise<Transaction[]>;
  addTransaction(row: any): Promise<Transaction>;
}

const IMPORTERS: BankImporter[] = [
  {
    slug: 'capital_one',
    name: 'Capital One',
    hint: 'Capital One credit card CSV. Uses Transaction Date, Card No., Description, Category, and Debit. Credits are skipped.',
    file_extensions: ['.csv'],
    parse: parseCapitalOne,
  },
  {
    slug: 'chase',
    name: 'Chase',
    hint: 'Chase credit card CSV. Uses Transaction Date, Description, Category, Type, and Amount. Negative Sale rows are imported as expenses; payments are skipped.',
    file_extensions: ['.csv'],
    parse: parseChase,
  },
  {
    slug: 'amex',
    name: 'American Express',
    hint: 'American Express credit card CSV. Uses Date, Description, Account #, Amount, and optional Category. Positive amounts are imported as expenses; credits are skipped.',
    file_extensions: ['.csv'],
    parse: parseAmex,
  },
  {
    slug: 'citi',
    name: 'Citi',
    hint: 'Citi credit card CSV. Uses Status, Date, Description, Debit, Credit, and Member Name. Cleared debit rows are imported as expenses; credits are skipped.',
    file_extensions: ['.csv'],
    parse: parseCiti,
  },
  {
    slug: 'x_money',
    name: 'X Money',
    hint: 'X Money CSV. Uses Date, Account, Description, Type, Category, Amount, and Status. Only completed negative Card Purchase rows are imported as expenses.',
    file_extensions: ['.csv'],
    parse: parseXMoney,
  },
];

const IMPORTER_ALIASES: Record<string, string> = {
  'capital-one': 'capital_one',
  capitalone: 'capital_one',
  american_express: 'amex',
};

export function listClientBankImports(): BankImportOption[] {
  return IMPORTERS.map(({ slug, name, hint, file_extensions }) => ({
    slug,
    name,
    hint,
    file_extensions,
  }));
}

export async function buildBankImportPreview(
  bankSlug: string,
  filename: string,
  content: string,
  existingDedupeKeys: Set<string>
): Promise<ImportPreviewResult> {
  const importer = getImporter(bankSlug);
  const parsed = await importer.parse(content);
  const seenInFile = new Set<string>();
  let newCount = 0;
  let duplicateCount = 0;
  const rows: ImportPreviewRow[] = parsed.map(row => {
    const duplicate = existingDedupeKeys.has(row.dedupe_key) || seenInFile.has(row.dedupe_key);
    if (duplicate) {
      duplicateCount += 1;
    } else {
      newCount += 1;
      seenInFile.add(row.dedupe_key);
    }
    return {
      ...row,
      account_display: accountDisplay(importer.name, row.account_mask),
      status: duplicate ? 'duplicate' : 'new',
    };
  });
  return {
    bank: importer.name,
    filename,
    rows,
    summary: {
      total_parsed: rows.length,
      new: newCount,
      duplicate: duplicateCount,
    },
  };
}

export async function commitBankImportRows(
  store: EncryptedImportStore,
  rows: ImportPreviewRow[]
): Promise<ImportCommitResult> {
  const existing = new Set(
    (await store.getTransactions()).map(tx => String((tx as any).dedupe_key || '')).filter(Boolean)
  );
  let inserted = 0;
  let skipped = 0;
  const seen = new Set<string>();
  for (const row of rows) {
    if (row.status !== 'new' || existing.has(row.dedupe_key) || seen.has(row.dedupe_key)) {
      skipped += 1;
      continue;
    }
    await store.addTransaction({
      date: row.date,
      type: 'expense',
      category: row.category,
      amount: row.amount,
      description: row.description,
      source: 'import',
      account_display: row.account_display,
      dedupe_key: row.dedupe_key,
    });
    inserted += 1;
    seen.add(row.dedupe_key);
  }
  return { inserted, skipped, batch_id: 0 };
}

async function parseCapitalOne(content: string): Promise<ParsedBankRow[]> {
  const { header, rows } = readCsvWithHeader(content, [
    'transaction date',
    'card no.',
    'description',
    'category',
    'debit',
    'credit',
  ]);
  const out: ParsedBankRow[] = [];
  for (const { row, lineNo } of rows) {
    const debit = parseAmount(row[header['debit']]);
    const credit = parseAmount(row[header['credit']]);
    if (debit <= 0 && credit > 0) continue;
    if (debit <= 0) continue;
    const date = parseDate(row[header['transaction date']], lineNo);
    const accountMask = row[header['card no.']].trim();
    if (!accountMask) throw new Error(`Line ${lineNo}: missing card number`);
    const description = normalizeDescription(row[header['description']]);
    const category = resolveCategory(description, row[header['category']]);
    out.push(await parsedRow('capital_one', accountMask, date, description, category, debit));
  }
  return out;
}

async function parseChase(content: string): Promise<ParsedBankRow[]> {
  const { header, rows } = readCsvWithHeader(content, [
    'transaction date',
    'post date',
    'description',
    'category',
    'type',
    'amount',
    'memo',
  ]);
  const out: ParsedBankRow[] = [];
  for (const { row, lineNo } of rows) {
    const rowType = row[header['type']].trim().toLowerCase();
    const amountRaw = parseAmount(row[header['amount']]);
    if (rowType !== 'sale' || amountRaw >= 0) continue;
    const date = parseDate(row[header['transaction date']], lineNo);
    const description = normalizeDescription(row[header['description']]);
    const category = resolveCategory(description, row[header['category']]);
    out.push(await parsedRow('chase', 'chase', date, description, category, Math.abs(amountRaw)));
  }
  return out;
}

async function parseAmex(content: string): Promise<ParsedBankRow[]> {
  const { header, rows } = readCsvWithHeader(content, [
    'date',
    'description',
    'account #',
    'amount',
  ]);
  const out: ParsedBankRow[] = [];
  for (const { row, lineNo } of rows) {
    const amount = parseAmount(row[header['amount']]);
    if (amount <= 0) continue;
    const date = parseDate(row[header['date']], lineNo);
    const accountMask = (row[header['account #']] || '').trim().replace(/^-+/, '') || 'amex';
    const description = normalizeDescription(row[header['description']]);
    const categoryIndex = header['category'];
    const category = resolveCategory(description, categoryIndex == null ? '' : row[categoryIndex]);
    out.push(await parsedRow('amex', accountMask, date, description, category, amount));
  }
  return out;
}

async function parseCiti(content: string): Promise<ParsedBankRow[]> {
  const { header, rows } = readCsvWithHeader(content, [
    'status',
    'date',
    'description',
    'debit',
    'credit',
    'member name',
  ]);
  const out: ParsedBankRow[] = [];
  for (const { row, lineNo } of rows) {
    const status = row[header['status']].trim().toLowerCase();
    if (status && status !== 'cleared') continue;
    const debit = parseAmount(row[header['debit']]);
    const credit = parseAmount(row[header['credit']]);
    if (debit <= 0 && credit > 0) continue;
    if (debit <= 0) continue;
    const date = parseDate(row[header['date']], lineNo);
    const accountMask = row[header['member name']].trim() || 'citi';
    const description = normalizeDescription(row[header['description']]);
    out.push(await parsedRow('citi', accountMask, date, description, resolveCategory(description), debit));
  }
  return out;
}

async function parseXMoney(content: string): Promise<ParsedBankRow[]> {
  const { header, rows } = readCsvWithHeader(content, [
    'date',
    'account',
    'description',
    'type',
    'category',
    'amount',
    'status',
  ]);
  const out: ParsedBankRow[] = [];
  for (const { row, lineNo } of rows) {
    const rowType = row[header['type']].trim().toLowerCase();
    const status = row[header['status']].trim().toLowerCase();
    const amountRaw = parseAmount(row[header['amount']]);
    if (rowType !== 'card purchase' || status !== 'completed' || amountRaw >= 0) continue;
    const date = parseDate(row[header['date']], lineNo);
    const accountMask = row[header['account']].trim();
    if (!accountMask) throw new Error(`Line ${lineNo}: missing account`);
    const description = normalizeDescription(row[header['description']]) || 'Card purchase';
    const category = resolveCategory(description, row[header['category']]);
    out.push(await parsedRow('x_money', accountMask, date, description, category, Math.abs(amountRaw)));
  }
  return out;
}

async function parsedRow(
  bankSlug: string,
  accountMask: string,
  date: string,
  description: string,
  category: string,
  amount: number
): Promise<ParsedBankRow> {
  return {
    date,
    account_mask: accountMask,
    description,
    category,
    amount: roundMoney(amount),
    dedupe_key: await buildDedupeKey(bankSlug, accountMask, date, amount, description),
  };
}

function getImporter(slug: string): BankImporter {
  const normalized = IMPORTER_ALIASES[slug] || slug;
  const importer = IMPORTERS.find(item => item.slug === normalized);
  if (!importer) throw new Error('Unknown bank import type');
  return importer;
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
  const rows = records.slice(1)
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

function parseDate(raw: string, lineNo: number): string {
  const value = (raw || '').trim();
  let match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
  if (match) {
    return `${match[3]}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}`;
  }
  throw new Error(`Line ${lineNo}: Unrecognized date: ${JSON.stringify(value)}`);
}

function parseAmount(raw: string): number {
  let value = (raw || '').trim().replace(/[$,]/g, '');
  if (!value) return 0;
  if (value.startsWith('(') && value.endsWith(')')) value = `-${value.slice(1, -1)}`;
  return roundMoney(Number(value));
}

function roundMoney(value: number): number {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function normalizeDescription(text: string): string {
  return (text || '').trim().replace(/\s+/g, ' ');
}

function resolveCategory(description: string, bankCategory = ''): string {
  if (`${description} ${bankCategory}`.toLowerCase().includes('costco')) return 'Costco';
  return bankCategory.trim() || 'Uncategorized';
}

function accountDisplay(bankName: string, accountMask: string): string {
  return `${bankName} ···${accountMask}`;
}

async function buildDedupeKey(
  bankSlug: string,
  accountMask: string,
  date: string,
  amount: number,
  description: string
): Promise<string> {
  const payload = [
    bankSlug,
    accountMask.trim(),
    date,
    roundMoney(amount).toFixed(2),
    normalizeDescription(description).toLowerCase(),
  ].join('|');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

import { NetWorth, ObservedNetWorthSnapshot } from '../models/transaction.model';

export function buildObservedSnapshot(
  nw: NetWorth,
  options: { note?: string; attribution?: string; recordedAt?: string } = {}
): Omit<ObservedNetWorthSnapshot, 'id'> {
  const recordedAt = options.recordedAt ?? new Date().toISOString();
  return {
    recorded_at: recordedAt,
    as_of: nw.as_of || recordedAt.slice(0, 10),
    other_assets: nw.other_assets,
    portfolio: nw.portfolio,
    liabilities: nw.liabilities,
    total_assets: nw.total_assets,
    total: nw.total,
    note: options.note?.trim() || undefined,
    attribution: (options.attribution?.trim() || 'unknown'),
  };
}

export interface SnapshotDelta {
  fromId: number;
  toId: number;
  deltaTotal: number;
  attribution: string;
}

/** Delta between consecutive snapshots; cause stays unknown unless labeled. */
export function attributeSnapshotDelta(
  older: ObservedNetWorthSnapshot,
  newer: ObservedNetWorthSnapshot
): SnapshotDelta {
  return {
    fromId: older.id,
    toId: newer.id,
    deltaTotal: Number((newer.total - older.total).toFixed(2)),
    attribution:
      newer.attribution && newer.attribution !== 'unknown'
        ? newer.attribution
        : 'unknown',
  };
}

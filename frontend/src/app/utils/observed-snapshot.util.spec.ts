import { buildObservedSnapshot, attributeSnapshotDelta } from './observed-snapshot.util';

describe('observed-snapshot.util', () => {
  const nw = {
    other_assets: 10_000,
    portfolio: 50_000,
    liabilities: 5_000,
    total_assets: 60_000,
    total: 55_000,
    as_of: '2026-07-01',
  };

  it('builds an explicit observed snapshot with unknown attribution by default', () => {
    const snap = buildObservedSnapshot(nw, { recordedAt: '2026-07-11T12:00:00.000Z' });
    expect(snap.total).toBe(55_000);
    expect(snap.attribution).toBe('unknown');
    expect(snap.as_of).toBe('2026-07-01');
    expect(snap.recorded_at).toBe('2026-07-11T12:00:00.000Z');
  });

  it('labels delta attribution as unknown when not provided', () => {
    const a = { id: 1, ...buildObservedSnapshot(nw), total: 50_000 };
    const b = { id: 2, ...buildObservedSnapshot({ ...nw, total: 55_000 }), total: 55_000 };
    const delta = attributeSnapshotDelta(a, b);
    expect(delta.deltaTotal).toBe(5000);
    expect(delta.attribution).toBe('unknown');
  });
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

// Exercise the real validator without browser storage or a database connection.
const { outputText } = ts.transpileModule(readFileSync('lib/backup.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const { encodeBackup, decodeBackup } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const fixture = {
  homes: [{ id: 'h', name: 'わが家', kind: 'home' }],
  products: [{ id: 'p', homeId: 'h', categoryId: 'aircon', maker: '', name: 'エアコン', modelNumber: '' }],
  tasks: [{ id: 't', productId: 'p', name: '掃除', kind: '掃除', intervalDays: 14, nextDueAt: '2026-10-19', lastCompletedAt: '2026-10-05', sourceKind: 'ユーザー設定' }],
  history: [{ id: 'a', taskId: 't', productId: 'p', completedAt: '2026-10-05', note: '実施済み' }],
};
const rawBackup = data => JSON.stringify({ app: 'ouchi-maintenance', version: 1, data });
const plain = value => JSON.parse(JSON.stringify(value));
function rejectsBoth(change) {
  const data = structuredClone(fixture);
  change(data);
  const before = structuredClone(data);
  assert.throws(() => decodeBackup(rawBackup(data)), 'restore must reject invalid records');
  assert.throws(() => encodeBackup(data), 'export must not produce an unusable backup');
  assert.deepEqual(data, before, 'validation must not alter the source records');
}

test('backup rejects duplicate IDs in every collection', () => {
  for (const section of Object.keys(fixture)) {
    rejectsBoth(data => data[section].push(structuredClone(data[section][0])));
  }
});

test('backup rejects orphaned homes, products, tasks and mismatched history', () => {
  for (const change of [
    data => { data.products[0].homeId = 'missing'; },
    data => { data.tasks[0].productId = 'missing'; },
    data => { data.history[0].taskId = 'missing'; },
    data => { data.history[0].productId = 'missing'; },
    data => {
      data.products.push({ ...data.products[0], id: 'other-product' });
      data.history[0].productId = 'other-product';
    },
  ]) rejectsBoth(change);
});

test('backup rejects invalid calendar dates in all date fields', () => {
  for (const [section, field] of [
    ['products', 'purchaseDate'], ['products', 'installedDate'],
    ['tasks', 'nextDueAt'], ['tasks', 'lastCompletedAt'], ['history', 'completedAt'],
  ]) {
    for (const invalid of ['2026-02-29', '2026-04-31', '2026-13-01', '2026-00-01', '2026-10-00', '2026-10-05T00:00:00Z']) {
      rejectsBoth(data => { data[section][0][field] = invalid; });
    }
  }
});

test('backup preserves leap days, optional dates and interval limits', () => {
  for (const intervalDays of [1, 3650]) {
    const data = structuredClone(fixture);
    Object.assign(data.products[0], { purchaseDate: '2024-02-29', installedDate: '2024-03-01', memo: '購入記録' });
    Object.assign(data.tasks[0], { intervalDays, sourceKind: '取扱説明書', sourceUrl: 'https://example.com/manual.pdf#page=3', sourceNote: '条件を確認', sourceFrequency: '説明書の目安' });
    const before = structuredClone(data);
    assert.deepEqual(plain(decodeBackup(encodeBackup(data))), data);
    assert.deepEqual(data, before);
  }
  for (const invalid of [0, -1, 3651, 1.5, '14', null]) {
    rejectsBoth(data => { data.tasks[0].intervalDays = invalid; });
  }
});

test('backup rejects missing collections, invalid rows and excessive record counts', () => {
  for (const section of Object.keys(fixture)) {
    for (const invalid of [undefined, null, {}, '[]', [null], [[]]]) {
      rejectsBoth(data => { data[section] = invalid; });
    }
    rejectsBoth(data => {
      data[section] = Array.from({ length: 10001 }, (_, index) => ({ ...data[section][0], id: `id-${index}` }));
    });
  }
  rejectsBoth(data => { data.homes = []; });
});

test('invalid envelopes and JSON are rejected without changing a valid backup', () => {
  const valid = encodeBackup(fixture);
  for (const raw of ['', '{', 'null', '[]', JSON.stringify({ app: 'other', version: 1, data: fixture }), JSON.stringify({ app: 'ouchi-maintenance', version: 2, data: fixture }), JSON.stringify({ app: 'ouchi-maintenance', version: '1', data: fixture })]) {
    assert.throws(() => decodeBackup(raw));
  }
  assert.deepEqual(plain(decodeBackup(valid)), fixture);
});

test('empty homes and independent household records survive backup round trips', () => {
  const data = structuredClone(fixture);
  data.homes.push({ id: 'parents', name: '実家', kind: 'parents' }, { id: 'empty-home', name: '別宅', kind: 'second' });
  data.products.push({ ...data.products[0], id: 'p2', homeId: 'parents', name: '実家の家電' });
  data.tasks.push({ ...data.tasks[0], id: 't2', productId: 'p2', kind: '交換' });
  data.history.push({ ...data.history[0], id: 'a2', taskId: 't2', productId: 'p2' });
  assert.deepEqual(plain(decodeBackup(encodeBackup(data))), data);
});

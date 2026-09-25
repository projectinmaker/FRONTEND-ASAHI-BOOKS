const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
function moduleWithApi(get, mutations = {}) {
  const source = fs.readFileSync(path.join(__dirname, '../src/lib/phase-a.ts'), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const exports = {};
  vm.runInNewContext(js, { exports, require: () => ({ api: { get, ...mutations } }) });
  return exports;
}
test('nullable supplier fields clear old values and preserve account numbers as text', () => {
  const m = moduleWithApi();
  const form = Object.fromEntries(m.supplierFoundationKeys.map(k => [k, '']));
  const payload = m.supplierFoundationPayload({ ...form, bankAccountNo: ' 0012345 ', country: ' Indonesia ' });
  assert.equal(payload.bankAccountNo, '0012345');
  assert.equal(payload.country, 'Indonesia');
  assert.equal(payload.currency, null);
  assert.equal(payload.supplierType, null);
  assert.equal(Object.keys(payload).length, 9);
});
test('FEFO expiry is conditional and legacy updates do not gain unsupported null fields', () => {
  const m = moduleWithApi();
  for (const method of ['FEFO', 'FIFO', 'AVERAGE', undefined]) {
    for (const type of ['TAMBAH', 'KURANG']) assert.equal(m.needsAdjustmentExpiry(type, method), type === 'TAMBAH' && method === 'FEFO');
  }
  assert.equal(m.adjustmentExpiryPayload(true, '2027-09-15').tanggalKedaluwarsa, '2027-09-15');
  assert.equal(Object.keys(m.adjustmentExpiryPayload(false, '')).length, 0);
  assert.equal(m.adjustmentExpiryPayload(false, '', '2027-09-15').tanggalKedaluwarsa, null);
});
test('supplier list joins full master fields, paginates and retains unlinked COA and suppliers without COA', async () => {
  const calls = [];
  const m = moduleWithApi(async url => {
    calls.push(url);
    if (url === '/master/supplier-coa') return [{ coaId: 'coa1', kode: '211001', nama: 'Hutang A', supplierId: '1', isLinked: true }, { coaId: 'coa2', kode: '211002', nama: 'Hutang B', supplierId: null, isLinked: false }];
    if (url.includes('skip=0')) return { data: [{ id: '1', kode: 'SUP1', nama: 'A', supplierType: 'COMPANY', city: 'Solo', bankAccountNo: '000123', currency: null }], total: 2 };
    return { data: [{ id: '2', kode: 'SUP2', nama: 'C', akunHutang: null }], total: 2 };
  });
  const rows = await m.loadSupplierRows();
  assert.equal(rows.length, 3);
  assert.equal(rows[0].kode, '211001');
  assert.equal(rows[0].kodeSupplier, 'SUP1');
  assert.equal(rows[0].bankAccountNo, '000123');
  assert.equal(rows[0].currency, null);
  assert.equal(rows[1].isLinked, false);
  assert.equal(rows[2].supplierId, '2');
  assert.match(calls[2], /skip=1/);
});
test('supplier list propagates page failures instead of silently showing incomplete filters', async () => {
  const m = moduleWithApi(async url => {
    if (url.includes('supplier-coa')) return [];
    throw new Error('offline');
  });
  await assert.rejects(m.loadSupplierRows(), /offline/);
});
test('supplier pagination terminates with an error on premature empty pages', async () => {
  const m = moduleWithApi(async url => url.includes('supplier-coa') ? [] : { data: [], total: 5 });
  await assert.rejects(m.loadSupplierRows(), /belum lengkap/);
});

test('normal supplier creation delegates empty currency default to backend, while update clears fields', async () => {
  const calls = [];
  const m = moduleWithApi(undefined, { post: async (url, body) => { calls.push({ url, body }); return { id: 'new' }; }, put: async (url, body) => { calls.push({ url, body }); return { id: 'new' }; } });
  const body = { kode: 'SUP1', nama: 'A', currency: null, bankAccountNo: null };
  await m.saveSupplier(body);
  assert.equal(Object.hasOwn(calls[0].body, 'currency'), false);
  await m.saveSupplier(body, { id: 'new' });
  assert.equal(calls[1].body.currency, null);
  assert.equal(calls[1].body.bankAccountNo, null);
});
test('COA linking persists new ID before Phase A update and retry updates without duplicate creation', async () => {
  const calls = [];
  let linkedId;
  let fail = true;
  const m = moduleWithApi(undefined, { post: async (url, body) => { calls.push({ url, body }); return { id: 'linked' }; }, put: async (url, body) => { calls.push({ url, body }); assert.equal(linkedId, 'linked'); if (fail) throw new Error('offline'); return { id: 'linked' }; } });
  const payload = { kode: 'SUP1', nama: 'A', bankAccountNo: '001234', supplierType: 'COMPANY', nitku: '111', syaratBayarId: 'term1' };
  await assert.rejects(m.saveSupplier(payload, { coaId: 'coa1', onLinked: id => { linkedId = id; } }), /offline/);
  assert.equal(linkedId, 'linked');
  assert.equal(calls[1].body.bankAccountNo, '001234');
  assert.equal(calls[1].body.syaratBayarId, 'term1');
  fail = false;
  await m.saveSupplier(payload, { id: linkedId, coaId: 'coa1' });
  assert.equal(calls.filter(call => call.url === '/master/supplier-from-coa').length, 1);
  assert.equal(calls[2].url, '/master/supplier/linked');
});

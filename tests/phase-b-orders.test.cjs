const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const crypto = require('node:crypto');
const path = require('node:path');
function load(api = {}) {
  const source = fs.readFileSync(path.join(__dirname, '../src/lib/order-documents.ts'), 'utf8');
  const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const exports = {};
  vm.runInNewContext(js, { exports, require: () => ({ api }), crypto });
  return exports;
}
const original = { id: 'so1', noPesanan: 'SO-1', status: 'DRAFT', tanggal: '2026-09-16T12:00:00', pelangganId: 'customer', currency: 'USD', customerPoNumber: 'CUSTOMER-PO', customerPoDate: '2026-09-10', ppn: '11', diskonGlobal: '0', details: [{ id: 'line1', barangId: 'b1', satuanId: 'u1', qty: '2', harga: '100.00', diskon: null, subTotal: '200.00' }] };
const plain = value => JSON.parse(JSON.stringify(value));
test('loads actual camelCase header and unit fields without inventing legacy defaults', () => {
  const m = load();
  assert.equal(m.orderHeaderFromResponse(original).customerPoDate, '2026-09-10');
  assert.equal(m.orderHeaderFromResponse(original).tanggal, '2026-09-16');
  assert.equal(m.orderLinesFromResponse(original)[0].satuanId, 'u1');
  assert.equal(m.orderHeaderFromResponse({ ...original, currency: undefined }).currency, '');
});
test('unchanged order omits details and header-only edit never replaces rows', () => {
  const m = load(); const header = m.orderHeaderFromResponse(original); const lines = m.orderLinesFromResponse(original);
  assert.deepEqual(plain(m.buildOrderUpdate('sales', header, lines, original)), {});
  assert.deepEqual(plain(m.buildOrderUpdate('sales', { ...header, keterangan: 'Catatan baru' }, lines, original)), { keterangan: 'Catatan baru' });
});
test('editing one unit sends every detail without response-only fields', () => {
  const m = load(); const two = { ...original, details: [...original.details, { id: 'line2', barangId: 'b2', satuanId: null, harga: 50, qty: 1, diskon: 0 }] };
  const lines = m.orderLinesFromResponse(two); lines[0].satuanId = 'u2';
  const patch = m.buildOrderUpdate('sales', m.orderHeaderFromResponse(two), lines, two);
  assert.equal(patch.details.length, 2); assert.equal(patch.details[0].satuanId, 'u2');
  assert.equal(patch.details[1].barangId, 'b2'); assert.equal(patch.details[1].satuanId, null);
  for (const detail of patch.details) { assert.equal('id' in detail, false); assert.equal('subTotal' in detail, false); }
});
test('explicit clears remain null and purchase payload only includes purchase headers', () => {
  const m = load(); const header = m.orderHeaderFromResponse(original);
  const patch = m.buildOrderUpdate('sales', { ...header, customerPoNumber: '', customerPoDate: '' }, m.orderLinesFromResponse(original), original);
  assert.equal(patch.customerPoNumber, null); assert.equal(patch.customerPoDate, null);
  const po = m.serializeOrderHeader('purchase', { ...m.newOrderHeader(), supplierId: 's1', syaratBayarId: 'term', currency: 'IDR' });
  assert.equal(po.syaratBayarId, 'term'); assert.equal('pelangganId' in po, false); assert.equal('customerPoNumber' in po, false);
});
test('numeric response formatting and row ordering do not falsely report changes', () => {
  const m = load(); const lines = [...original.details, { barangId: 'b2', satuanId: null, harga: '50', qty: '1', diskon: '0' }];
  const requested = { details: lines.map(line => ({ ...line, harga: Number(line.harga), qty: Number(line.qty) })).reverse() };
  assert.equal(m.orderSaveMismatches('sales', requested, { ...original, details: lines }).length, 0);
});
test('ignored customer PO, currency, payment term and unit writes are detected', () => {
  const m = load();
  const result = m.orderSaveMismatches('sales', { customerPoNumber: 'NEW', currency: 'IDR', details: [{ ...original.details[0], satuanId: 'other' }] }, original);
  assert.ok(result.includes('Customer PO Number')); assert.ok(result.includes('Currency')); assert.ok(result.includes('Detail barang / satuan'));
  assert.ok(m.orderSaveMismatches('purchase', { syaratBayarId: 'term' }, { ...original, supplierId: 'supplier', syaratBayarId: null }).includes('Syarat Bayar'));
});
test('unknown and approved states are read-only and a late approval prevents PUT', async () => {
  const calls = []; const m = load({ get: async () => ({ ...original, status: 'DIPROSES' }), put: async () => { calls.push('put'); } });
  for (const status of ['DIPROSES', 'SELESAI', 'DIBATALKAN', undefined, 'UNKNOWN']) assert.equal(m.canEditOrder(status), false);
  assert.equal(m.canEditOrder('DRAFT'), true);
  await assert.rejects(m.persistOrder('sales', { customerPoNumber: 'NEW' }, 'so1'), /DIPROSES/);
  assert.equal(calls.length, 0);
});
test('create disables auto journal and preserves created ID before reporting ignored fields', async () => {
  const calls = []; let retainedId;
  const m = load({ post: async (url, payload) => { calls.push({ url, payload }); return original; }, get: async () => original, put: async (url, payload) => { calls.push({ url, payload }); return { ...original, ...payload }; } });
  const result = await m.persistOrder('sales', { customerPoNumber: 'NEW', autoPostJurnal: true }, undefined, order => { retainedId = order.id; });
  assert.equal(calls[0].payload.autoPostJurnal, false); assert.equal(retainedId, 'so1'); assert.equal(result.mismatches.length, 1);
  await m.persistOrder('sales', { customerPoNumber: 'NEW' }, retainedId);
  assert.equal(calls[1].url, '/penjualan/sales-order/so1'); assert.equal('autoPostJurnal' in calls[1].payload, false);
});
test('HTTP validation failures propagate unchanged', async () => {
  const error = new Error('SO sudah approved, tidak bisa edit detail');
  const m = load({ get: async () => original, put: async () => { throw error; } });
  await assert.rejects(m.persistOrder('sales', { details: [] }, 'so1'), caught => caught === error);
});
test('currency summaries keep IDR, USD and unspecified values separate', () => {
  const m = load();
  const summary = m.summarizeOrderTotals([{ grandTotal: 100, currency: 'USD' }, { grandTotal: '50', currency: 'USD' }, { grandTotal: 20000, currency: 'IDR' }, { grandTotal: 10, currency: null }]);
  assert.match(summary, /USD 150/); assert.match(summary, /IDR/); assert.match(summary, /mata uang tidak tersedia/);
  assert.equal(m.formatOrderMoney(25, null).includes('IDR'), false);
});

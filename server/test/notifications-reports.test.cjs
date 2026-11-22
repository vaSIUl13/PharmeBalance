const assert = require('node:assert/strict');
const { test } = require('node:test');
const { Workbook } = require('exceljs');
const { transferEmail } = require('../dist/modules/notifications/transfer-email');
const { csvCell, reportFile } = require('../dist/modules/reports/report-format');

test('transfer email includes plain text and escapes HTML from the catalog', () => {
  const mail = transferEmail({ code: 'DISPATCH', recommendationId: 42, donor: '<img onerror="x">',
    recipient: 'A & B', drugName: 'Drug', sku: 'SKU-01', quantity: 12, status: 'У виконанні',
    time: new Date('2026-11-21T09:00:00Z') });
  assert.match(mail.text, /<img onerror="x">/);
  assert.match(mail.html, /&lt;img onerror=&quot;x&quot;&gt;/);
  assert.match(mail.html, /A &amp; B/);
  assert.doesNotMatch(mail.html, /<img onerror/);
  assert.match(mail.text, /2026-11-21T09:00:00.000Z/);
});

test('CSV sanitizes formula-like cells and XLSX serializes strings as text', async () => {
  for (const value of ['=1+1', '+1', '-1', '@SUM(A1:A2)', '  =1+1', '\ttext']) {
    assert(csvCell(value).startsWith('"\''));
  }
  assert.equal(csvCell(12), '12');
  assert.equal(csvCell('A"B'), '"A""B"');
  const report = { period: { from: '=1+1', to: '2026-11-21', timeZone: 'Europe/Kyiv' }, pharmacyId: null,
    totals: { shortageRisks: 0, surplusPositions: 0, recommendations: 0, confirmed: 0, dispatched: 0, completed: 0, movedUnits: 0 } };
  const workbook = new Workbook();
  await workbook.xlsx.load(await reportFile(report, 'xlsx'));
  assert.equal(workbook.getWorksheet(1).getCell('B2').value, '=1+1');
  assert.equal(workbook.getWorksheet(1).getCell('B2').formula, undefined);
});

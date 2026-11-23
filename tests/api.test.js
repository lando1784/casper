const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { createApp } = require('../src/app');
const { shiftMonth, isValidMonth, isValidDate, addDaysISO } = require('../src/month');
const { buildICS, escapeICS, googleCalendarUrl } = require('../src/calendar');

function startServer() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'casper-test-'));
  const server = createApp({ dataFile: path.join(dir, 'db.json') });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve({ server, base: `http://127.0.0.1:${server.address().port}`, dir });
    });
  });
}

async function api(base, method, p, body) {
  const res = await fetch(base + p, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = null;
  }
  return { status: res.status, json, text, headers: res.headers };
}

test('utilità mese', () => {
  assert.equal(isValidMonth('2025-11'), true);
  assert.equal(isValidMonth('2025-13'), false);
  assert.equal(isValidMonth('11-2025'), false);
  assert.equal(shiftMonth('2025-01', -1), '2024-12');
  assert.equal(shiftMonth('2025-12', 1), '2026-01');
  assert.equal(isValidDate('2025-02-28'), true);
  assert.equal(isValidDate('2025-02-30'), false);
  assert.equal(addDaysISO('2025-12-31', 1), '2026-01-01');
});

test('utilità calendario', () => {
  assert.equal(escapeICS('a,b;c\nd'), 'a\\,b\\;c\\nd');
  const ics = buildICS([{ uid: 'ent_1@casper', date: '2025-11-05', summary: 'Test — 10,00 €', description: 'd' }]);
  assert.match(ics, /BEGIN:VCALENDAR/);
  assert.match(ics, /DTSTART;VALUE=DATE:20251105/);
  assert.match(ics, /DTEND;VALUE=DATE:20251106/);
  assert.match(ics, /UID:ent_1@casper/);
  const url = googleCalendarUrl({ title: 'X', date: '2025-11-05', details: 'y' });
  assert.match(url, /^https:\/\/calendar\.google\.com\/calendar\/render\?/);
  assert.match(url, /dates=20251105%2F20251106/);
});

test('API: flusso completo spese', async (t) => {
  const { server, base, dir } = await startServer();
  t.after(() => server.close());

  const health = await api(base, 'GET', '/api/health');
  assert.equal(health.status, 200);
  assert.equal(health.json.ok, true);

  const index = await api(base, 'GET', '/');
  assert.equal(index.status, 200);
  assert.match(index.text, /casper/);

  const traversal = await api(base, 'GET', '/../server.js');
  assert.equal(traversal.status, 404);

  const badMonth = await api(base, 'GET', '/api/state?month=pippo');
  assert.equal(badMonth.status, 400);

  const noName = await api(base, 'POST', '/api/expenses', { type: 'fixed' });
  assert.equal(noName.status, 400);
  const badType = await api(base, 'POST', '/api/expenses', { name: 'X', type: 'weird' });
  assert.equal(badType.status, 400);
  const unitNoCost = await api(base, 'POST', '/api/expenses', { name: 'Acqua', type: 'unit' });
  assert.equal(unitNoCost.status, 400);

  const fixed = await api(base, 'POST', '/api/expenses', { name: 'Affitto', type: 'fixed' });
  assert.equal(fixed.status, 201);
  assert.equal(fixed.json.type, 'fixed');

  const unit = await api(base, 'POST', '/api/expenses', { name: 'Acqua', type: 'unit', costPerUnit: 0.5 });
  assert.equal(unit.status, 201);
  assert.equal(unit.json.costPerUnit, 0.5);

  const month = health.json.month;
  const d1 = `${month}-05`;
  const d2 = `${month}-20`;

  const e1 = await api(base, 'POST', '/api/entries', { expenseId: fixed.json.id, date: d1, value: 800, note: 'mensile' });
  assert.equal(e1.status, 201);
  const e2 = await api(base, 'POST', '/api/entries', { expenseId: unit.json.id, date: d2, value: 10 });
  assert.equal(e2.status, 201);

  const badDate = await api(base, 'POST', '/api/entries', { expenseId: fixed.json.id, date: '2025-02-30', value: 1 });
  assert.equal(badDate.status, 400);
  const neg = await api(base, 'POST', '/api/entries', { expenseId: fixed.json.id, date: d1, value: -3 });
  assert.equal(neg.status, 400);
  const unknown = await api(base, 'POST', '/api/entries', { expenseId: 'exp_999', date: d1, value: 1 });
  assert.equal(unknown.status, 404);

  let state = (await api(base, 'GET', `/api/state?month=${month}`)).json;
  assert.equal(state.total, 805);
  const acqua = state.expenses.find((e) => e.id === unit.json.id);
  assert.equal(acqua.total, 5);
  assert.equal(acqua.totalUnits, 10);
  assert.equal(acqua.rate, 0.5);
  assert.equal(acqua.entries[0].amount, 5);
  const affitto = state.expenses.find((e) => e.id === fixed.json.id);
  assert.equal(affitto.total, 800);

  const rate = await api(base, 'PUT', `/api/expenses/${unit.json.id}/rate`, { month, costPerUnit: 2 });
  assert.equal(rate.status, 200);
  state = (await api(base, 'GET', `/api/state?month=${month}`)).json;
  const acqua2 = state.expenses.find((e) => e.id === unit.json.id);
  assert.equal(acqua2.rate, 2);
  assert.equal(acqua2.hasMonthOverride, true);
  assert.equal(acqua2.total, 20);
  assert.equal(acqua2.entries[0].amount, 20);
  assert.equal(state.total, 820);

  const otherMonth = shiftMonth(month, 1);
  const stateOther = (await api(base, 'GET', `/api/state?month=${otherMonth}`)).json;
  const acquaOther = stateOther.expenses.find((e) => e.id === unit.json.id);
  assert.equal(acquaOther.rate, 0.5);
  assert.equal(acquaOther.hasMonthOverride, false);
  assert.equal(stateOther.total, 0);

  const delRate = await api(base, 'DELETE', `/api/expenses/${unit.json.id}/rate?month=${month}`);
  assert.equal(delRate.status, 200);
  assert.equal(delRate.json.costPerUnit, 0.5);
  state = (await api(base, 'GET', `/api/state?month=${month}`)).json;
  assert.equal(state.expenses.find((e) => e.id === unit.json.id).total, 5);
  assert.equal(state.total, 805);

  const renamed = await api(base, 'PATCH', `/api/expenses/${fixed.json.id}`, { name: 'Affitto casa' });
  assert.equal(renamed.json.name, 'Affitto casa');

  const patchedEntry = await api(base, 'PATCH', `/api/entries/${e2.json.id}`, { value: 12, note: 'lettura' });
  assert.equal(patchedEntry.json.value, 12);
  state = (await api(base, 'GET', `/api/state?month=${month}`)).json;
  assert.equal(state.total, 806);

  const google = await api(base, 'GET', `/api/entries/${e1.json.id}/google`);
  assert.equal(google.status, 200);
  assert.match(google.json.url, /^https:\/\/calendar\.google\.com\//);

  const ics = await api(base, 'GET', `/api/calendar.ics?month=${month}`);
  assert.equal(ics.status, 200);
  assert.match(ics.headers.get('content-type'), /text\/calendar/);
  assert.match(ics.text, /BEGIN:VEVENT/);
  assert.match(ics.text, /SUMMARY:Affitto casa/);
  assert.match(ics.text, /SUMMARY:Acqua/);

  const delEntry = await api(base, 'DELETE', `/api/entries/${e1.json.id}`);
  assert.equal(delEntry.status, 200);
  state = (await api(base, 'GET', `/api/state?month=${month}`)).json;
  assert.equal(state.total, 6);

  const delExpense = await api(base, 'DELETE', `/api/expenses/${unit.json.id}`);
  assert.equal(delExpense.status, 200);
  state = (await api(base, 'GET', `/api/state?month=${month}`)).json;
  assert.equal(state.expenses.length, 1);
  assert.equal(state.total, 0);

  const missing = await api(base, 'GET', '/api/expenses/exp_999');
  assert.equal(missing.status, 404);

  assert.ok(fs.existsSync(path.join(dir, 'db.json')));
});

test('PWA: manifest, service worker, icone e meta tag serviti', async (t) => {
  const { server, base } = await startServer();
  t.after(() => server.close());

  const manifest = await api(base, 'GET', '/manifest.webmanifest');
  assert.equal(manifest.status, 200);
  assert.match(manifest.headers.get('content-type'), /application\/manifest\+json/);
  assert.equal(manifest.json.display, 'standalone');
  assert.equal(manifest.json.start_url, '/');
  assert.ok(manifest.json.icons.length >= 2);
  for (const icon of manifest.json.icons) {
    const res = await fetch(base + icon.src);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /image\/png/);
    const buf = Buffer.from(await res.arrayBuffer());
    assert.deepEqual([...buf.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]); // firma PNG
    assert.equal(buf.readUInt32BE(16), Number(icon.sizes.split('x')[0]));
  }

  const sw = await api(base, 'GET', '/sw.js');
  assert.equal(sw.status, 200);
  assert.match(sw.text, /addEventListener\('fetch'/);
  assert.match(sw.text, /manifest\.webmanifest/);

  const index = await api(base, 'GET', '/');
  assert.match(index.text, /rel="manifest" href="\/manifest\.webmanifest"/);
  assert.match(index.text, /name="theme-color"/);
  assert.match(index.text, /serviceWorker\.register/);
});

test('avvio: server.js stampa gli URL e risponde su /api/health', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'casper-boot-'));
  const child = spawn(process.execPath, ['server.js'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, PORT: '0', DATA_FILE: path.join(dir, 'db.json') },
  });
  t.after(() => child.kill());
  let out = '';
  const port = await new Promise((resolve, reject) => {
    const to = setTimeout(() => reject(new Error(`timeout avvio. Output: ${out}`)), 10000);
    child.stdout.on('data', (d) => {
      out += d;
      const m = out.match(/http:\/\/localhost:(\d+)/);
      if (m) {
        clearTimeout(to);
        resolve(Number(m[1]));
      }
    });
    child.stderr.on('data', (d) => { out += d; });
    child.on('error', reject);
  });
  assert.ok(port > 0);
  assert.match(out, /Dati salvati in:/);
  const res = await fetch(`http://127.0.0.1:${port}/api/health`);
  assert.equal(res.status, 200);
  assert.equal((await res.json()).ok, true);
});

test('API: persistenza su ricarico dello store', async (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'casper-persist-'));
  const file = path.join(dir, 'db.json');
  const s1 = createApp({ dataFile: file });
  await new Promise((resolve) => s1.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${s1.address().port}`;
  t.after(() => s1.close());
  const exp = await api(base, 'POST', '/api/expenses', { name: 'Gas', type: 'unit', costPerUnit: 1.2 });
  await api(base, 'POST', '/api/entries', { expenseId: exp.json.id, date: '2025-11-10', value: 30 });
  s1.close();

  const s2 = createApp({ dataFile: file });
  await new Promise((resolve) => s2.listen(0, '127.0.0.1', resolve));
  t.after(() => s2.close());
  const base2 = `http://127.0.0.1:${s2.address().port}`;
  const state = (await api(base2, 'GET', '/api/state?month=2025-11')).json;
  assert.equal(state.total, 36);
  assert.equal(state.expenses[0].name, 'Gas');
});

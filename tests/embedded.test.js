const test = require('node:test');
const assert = require('node:assert/strict');
const { createApi, KEY } = require('../public/embedded-api');

function memStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
  };
}

test('embedded api (localStorage): stesso flusso della REST', async () => {
  const storage = memStorage();
  const api = createApi(storage);

  const health = await api('GET', '/api/health');
  assert.equal(health.ok, true);
  const month = health.month;

  const unit = await api('POST', '/api/expenses', { name: 'Acqua', type: 'unit', costPerUnit: 0.5 });
  const fixed = await api('POST', '/api/expenses', { name: 'Spesa', type: 'fixed' });
  const e1 = await api('POST', '/api/entries', { expenseId: unit.id, date: `${month}-10`, value: 8, note: 'lettura' });
  await api('POST', '/api/entries', { expenseId: fixed.id, date: `${month}-11`, value: 20 });

  let st = await api('GET', `/api/state?month=${month}`);
  assert.equal(st.total, 24); // 8 * 0.5 + 20

  await api('PUT', `/api/expenses/${unit.id}/rate`, { month, costPerUnit: 1.5 });
  st = await api('GET', `/api/state?month=${month}`);
  assert.equal(st.total, 32); // 8 * 1.5 + 20

  await api('DELETE', `/api/expenses/${unit.id}/rate?month=${month}`);
  st = await api('GET', `/api/state?month=${month}`);
  assert.equal(st.total, 24);

  const g = await api('GET', `/api/entries/${e1.id}/google`);
  assert.match(g.url, /^https:\/\/calendar\.google\.com\//);

  const ics = await api('GET', `/api/calendar.ics?month=${month}`);
  assert.match(ics, /BEGIN:VCALENDAR/);
  assert.match(ics, /SUMMARY:Acqua/);
  assert.match(ics, /SUMMARY:Spesa/);

  await assert.rejects(api('GET', '/api/state?month=xx'), /Mese non valido/);
  await assert.rejects(api('POST', '/api/expenses', { name: 'X', type: 'unit' }), /Costo\/unità non valido/);
  await assert.rejects(api('GET', '/api/nope'), /Endpoint non trovato/);

  // persistenza su "ricarico" (nuova istanza sullo stesso storage)
  assert.ok(storage.getItem(KEY));
  const api2 = createApi(storage);
  const st2 = await api2('GET', `/api/state?month=${month}`);
  assert.equal(st2.total, 24);

  // export / import
  const json = api.exportJSON();
  const api3 = createApi(memStorage());
  await api3.importJSON(json);
  assert.equal((await api3('GET', `/api/state?month=${month}`)).total, 24);
  await assert.rejects(api3.importJSON('{"foo":1}'), /File non valido/);
});

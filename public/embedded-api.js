// Versione "file singolo": emula via software le stesse rotte REST di
// src/app.js, ma sul Domain con persistenza in localStorage.
// Caricato sia dal browser (window.CasperEmbedded) sia dai test Node.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('../src/errors'), require('../src/month'), require('../src/calendar'), require('../src/domain'));
  } else {
    root.CasperEmbedded = factory(root.CasperErrors, root.CasperMonth, root.CasperCalendar, root.CasperDomain);
  }
})(typeof self !== 'undefined' ? self : this, function (errors, month, calendar, domain) {
  const { HttpError } = errors;
  const { isValidMonth, currentMonth } = month;
  const { buildICS, googleCalendarUrl, entryEvent } = calendar;
  const { Domain } = domain;

  const KEY = 'casper-data-v1';

  class LocalStore extends Domain {
    constructor(storage) {
      let data = null;
      try {
        data = JSON.parse(storage.getItem(KEY) || 'null');
      } catch {
        data = null;
      }
      super(data || undefined);
      this.storage = storage;
    }

    _persist() {
      this.storage.setItem(KEY, JSON.stringify(this.data));
    }
  }

  function createApi(storage) {
    const store = new LocalStore(storage);

    async function api(method, path, body) {
      const payload = body || {};
      const url = new URL(path, 'http://casper.local');
      const p = url.pathname;
      const q = url.searchParams;
      let m;

      if (method === 'GET' && p === '/api/health') return { ok: true, month: currentMonth() };

      if (method === 'GET' && p === '/api/state') {
        const mo = q.get('month') || currentMonth();
        if (!isValidMonth(mo)) throw new HttpError(400, 'Mese non valido (formato YYYY-MM)');
        return store.monthState(mo);
      }

      if (method === 'POST' && p === '/api/expenses') return store.addExpense(payload);

      if ((m = p.match(/^\/api\/expenses\/([^/]+)\/rate$/))) {
        const mo = method === 'PUT' ? (payload.month || q.get('month')) : q.get('month');
        if (!mo) throw new HttpError(400, 'Indicare il mese (YYYY-MM)');
        if (method === 'PUT') return store.setRate(m[1], mo, payload.costPerUnit);
        if (method === 'DELETE') return store.deleteRate(m[1], mo);
      }

      if ((m = p.match(/^\/api\/expenses\/([^/]+)$/))) {
        if (method === 'PATCH') return store.updateExpense(m[1], payload);
        if (method === 'DELETE') {
          store.deleteExpense(m[1]);
          return { ok: true };
        }
      }

      if (method === 'POST' && p === '/api/entries') return store.addEntry(payload);

      if ((m = p.match(/^\/api\/entries\/([^/]+)\/google$/))) {
        if (method !== 'GET') throw new HttpError(404, 'Endpoint non trovato');
        const entry = store.getEntry(m[1]);
        const expense = store.getExpense(entry.expenseId);
        const amount = store.entryAmount(expense, entry);
        const ev = entryEvent({ ...expense, rate: store.effectiveRate(expense, entry.month) }, entry, amount);
        return { url: googleCalendarUrl({ title: ev.summary, date: entry.date, details: ev.description }) };
      }

      if ((m = p.match(/^\/api\/entries\/([^/]+)$/))) {
        if (method === 'PATCH') return store.updateEntry(m[1], payload);
        if (method === 'DELETE') {
          store.deleteEntry(m[1]);
          return { ok: true };
        }
      }

      if (method === 'GET' && p === '/api/calendar.ics') {
        const mo = q.get('month') || currentMonth();
        if (!isValidMonth(mo)) throw new HttpError(400, 'Mese non valido (formato YYYY-MM)');
        const state = store.monthState(mo);
        const events = [];
        for (const expense of state.expenses) {
          for (const entry of expense.entries) events.push(entryEvent(expense, entry, entry.amount));
        }
        return buildICS(events);
      }

      throw new HttpError(404, 'Endpoint non trovato');
    }

    api.store = store;

    api.exportJSON = () => JSON.stringify(store.data, null, 2);

    api.importJSON = async (text) => {
      const data = JSON.parse(text);
      if (!data || !Array.isArray(data.expenses) || !Array.isArray(data.entries)) {
        throw new HttpError(400, 'File non valido (mancano expenses/entries)');
      }
      store.data = { seq: 1, expenses: [], entries: [], ...data };
      store._persist();
      return { ok: true };
    };

    if (typeof document !== 'undefined') {
      const downloadBlob = (blob, filename) => {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      };
      api.downloadICS = async (mo) => {
        const ics = await api('GET', `/api/calendar.ics?month=${mo}`);
        downloadBlob(new Blob([ics], { type: 'text/calendar' }), `casper-${mo}.ics`);
      };
      api.downloadJSONFile = () => {
        downloadBlob(new Blob([api.exportJSON()], { type: 'application/json' }), 'casper-dati.json');
      };
    }

    return api;
  }

  return { createApi, LocalStore, KEY };
});

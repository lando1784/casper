const http = require('http');
const fs = require('fs');
const path = require('path');
const { Store } = require('./store');
const { HttpError } = require('./errors');
const { isValidMonth, currentMonth } = require('./month');
const { buildICS, googleCalendarUrl, entryEvent } = require('./calendar');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.ico': 'image/x-icon',
};

const eur = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });

function sendJSON(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body) });
  res.end(body);
}

function readBody(req, limit = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new HttpError(413, 'Payload troppo grande'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

async function readJSON(req) {
  const raw = await readBody(req);
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw new HttpError(400, 'Body JSON non valido');
  }
}

function serveStatic(res, pathname) {
  const rel = pathname === '/' ? 'index.html' : decodeURIComponent(pathname.slice(1));
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (file !== PUBLIC_DIR && !file.startsWith(PUBLIC_DIR + path.sep)) {
    sendJSON(res, 403, { error: 'Accesso negato' });
    return;
  }
  fs.readFile(file, (err, content) => {
    if (err) {
      sendJSON(res, 404, { error: 'Non trovato' });
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(content);
  });
}

function createApp({ dataFile }) {
  const store = new Store(dataFile);

  const routes = [
    {
      method: 'GET',
      pattern: /^\/api\/health$/,
      handler: async () => ({ status: 200, body: { ok: true, month: currentMonth() } }),
    },
    {
      method: 'GET',
      pattern: /^\/api\/state$/,
      handler: async (req, match, query) => {
        const month = query.get('month') || currentMonth();
        if (!isValidMonth(month)) throw new HttpError(400, 'Mese non valido (formato YYYY-MM)');
        return { status: 200, body: store.monthState(month) };
      },
    },
    {
      method: 'POST',
      pattern: /^\/api\/expenses$/,
      handler: async (req, match, query, body) => ({ status: 201, body: store.addExpense(body) }),
    },
    {
      method: 'PATCH',
      pattern: /^\/api\/expenses\/([^/]+)$/,
      handler: async (req, match, query, body) => ({ status: 200, body: store.updateExpense(match[1], body) }),
    },
    {
      method: 'DELETE',
      pattern: /^\/api\/expenses\/([^/]+)$/,
      handler: async (req, match) => {
        store.deleteExpense(match[1]);
        return { status: 200, body: { ok: true } };
      },
    },
    {
      method: 'PUT',
      pattern: /^\/api\/expenses\/([^/]+)\/rate$/,
      handler: async (req, match, query, body) => {
        const month = body.month || query.get('month');
        if (!month) throw new HttpError(400, 'Indicare il mese (YYYY-MM)');
        return { status: 200, body: store.setRate(match[1], month, body.costPerUnit) };
      },
    },
    {
      method: 'DELETE',
      pattern: /^\/api\/expenses\/([^/]+)\/rate$/,
      handler: async (req, match, query) => {
        const month = query.get('month');
        if (!month) throw new HttpError(400, 'Indicare il mese (YYYY-MM)');
        return { status: 200, body: store.deleteRate(match[1], month) };
      },
    },
    {
      method: 'POST',
      pattern: /^\/api\/entries$/,
      handler: async (req, match, query, body) => ({ status: 201, body: store.addEntry(body) }),
    },
    {
      method: 'PATCH',
      pattern: /^\/api\/entries\/([^/]+)$/,
      handler: async (req, match, query, body) => ({ status: 200, body: store.updateEntry(match[1], body) }),
    },
    {
      method: 'DELETE',
      pattern: /^\/api\/entries\/([^/]+)$/,
      handler: async (req, match) => {
        store.deleteEntry(match[1]);
        return { status: 200, body: { ok: true } };
      },
    },
    {
      method: 'GET',
      pattern: /^\/api\/entries\/([^/]+)\/google$/,
      handler: async (req, match) => {
        const entry = store.getEntry(match[1]);
        const expense = store.getExpense(entry.expenseId);
        const amount = store.entryAmount(expense, entry);
        const ev = entryEvent({ ...expense, rate: store.effectiveRate(expense, entry.month) }, entry, amount);
        return { status: 200, body: { url: googleCalendarUrl({ title: ev.summary, date: entry.date, details: ev.description }) } };
      },
    },
    {
      method: 'GET',
      pattern: /^\/api\/calendar\.ics$/,
      handler: async (req, match, query) => {
        const month = query.get('month') || currentMonth();
        if (!isValidMonth(month)) throw new HttpError(400, 'Mese non valido (formato YYYY-MM)');
        const state = store.monthState(month);
        const events = [];
        for (const expense of state.expenses) {
          for (const entry of expense.entries) {
            events.push(entryEvent(expense, entry, entry.amount));
          }
        }
        return {
          status: 200,
          body: buildICS(events),
          contentType: 'text/calendar; charset=utf-8',
          headers: { 'Content-Disposition': `attachment; filename="casper-${month}.ics"` },
        };
      },
    },
  ];

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      const pathname = url.pathname;
      if (pathname.startsWith('/api/')) {
        let matched = null;
        for (const route of routes) {
          if (route.method !== req.method) continue;
          const m = route.pattern.exec(pathname);
          if (m) {
            matched = { route, m };
            break;
          }
        }
        if (!matched) {
          sendJSON(res, 404, { error: 'Endpoint non trovato' });
          return;
        }
        const body = ['POST', 'PUT', 'PATCH'].includes(req.method) ? await readJSON(req) : {};
        const result = await matched.route.handler(req, matched.m, url.searchParams, body);
        if (result.contentType) {
          res.writeHead(result.status, { 'Content-Type': result.contentType, ...(result.headers || {}) });
          res.end(result.body);
        } else {
          sendJSON(res, result.status, result.body);
        }
      } else if (req.method === 'GET') {
        serveStatic(res, pathname);
      } else {
        sendJSON(res, 405, { error: 'Metodo non consentito' });
      }
    } catch (err) {
      if (err instanceof HttpError) {
        sendJSON(res, err.status, { error: err.message });
      } else {
        console.error(err);
        sendJSON(res, 500, { error: 'Errore interno del server' });
      }
    }
  });

  server.store = store;
  return server;
}

module.exports = { createApp, eur };

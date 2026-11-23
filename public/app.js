const eur = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });
const fmt = (n) => eur.format(n);

const state = { month: currentMonth(), data: null };

function currentMonth(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function shiftMonth(m, delta) {
  const [y, mm] = m.split('-').map(Number);
  const d = new Date(y, mm - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(m) {
  const [y, mm] = m.split('-').map(Number);
  return new Intl.DateTimeFormat('it-IT', { month: 'long', year: 'numeric' }).format(new Date(y, mm - 1, 1));
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDaysISO(s, n) {
  const d = new Date(`${s}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function gcalUrl(title, date, details) {
  const p = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: `${date.replaceAll('-', '')}/${addDaysISO(date, 1).replaceAll('-', '')}`,
    details,
  });
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}

async function api(method, path, body) {
  if (window.__CASPER_EMBEDDED__ && window.__CASPER_API__) return window.__CASPER_API__(method, path, body);
  const res = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    json = { error: text };
  }
  if (!res.ok) throw new Error(json.error || `Errore ${res.status}`);
  return json;
}

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.add('hidden'), 3500);
}

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'href') {
      node.setAttribute('href', v);
      node.setAttribute('target', '_blank');
      node.setAttribute('rel', 'noopener');
    } else if (k.startsWith('data-')) node.setAttribute(k, v);
    else node[k] = v;
  }
  for (const c of children) node.append(c);
  return node;
}

async function load() {
  state.data = await api('GET', `/api/state?month=${state.month}`);
  render();
}

function render() {
  document.getElementById('month-label').textContent = monthLabel(state.month);
  document.getElementById('month-total').textContent = fmt(state.data.total);
  document.getElementById('ics-link').setAttribute('href', `/api/calendar.ics?month=${state.month}`);
  const container = document.getElementById('voices');
  container.replaceChildren();
  if (!state.data.expenses.length) {
    container.append(el('p', { class: 'empty' }, 'Nessuna voce di spesa: aggiungine una nel pannello sopra.'));
    return;
  }
  for (const v of state.data.expenses) container.append(voiceCard(v));
}

function voiceCard(v) {
  const card = el('section', { class: 'panel voice' });

  const head = el('div', { class: 'voice-head' });
  head.append(
    el('h3', {}, v.name),
    el('span', { class: `badge ${v.type}` }, v.type === 'unit' ? 'costo/unità' : 'cifra'),
    el('button', { class: 'btn danger small', 'data-action': 'del-voice', 'data-id': v.id, title: 'Elimina voce e inserimenti' }, '🗑'),
  );

  const meta = el('div', { class: 'voice-meta' });
  if (v.type === 'unit') {
    const rateWrap = el('div', { class: 'rate-wrap' });
    const input = el('input', {
      type: 'number', step: '0.01', min: '0', value: String(v.rate),
      class: 'rate-input', 'data-role': 'rate-input', 'data-id': v.id,
      title: 'Costo/unità per questo mese',
    });
    rateWrap.append(el('span', {}, `Tariffa ${monthLabel(state.month)}:`), input,
      el('button', { class: 'btn small', 'data-action': 'save-rate', 'data-id': v.id }, 'Salva tariffa'));
    if (v.hasMonthOverride) {
      rateWrap.append(el('button', { class: 'btn ghost small', 'data-action': 'reset-rate', 'data-id': v.id, title: 'Torna alla tariffa base della voce' }, 'Usa tariffa base'));
    }
    meta.append(rateWrap, el('span', { class: 'muted' }, `Tariffa base: ${fmt(v.costPerUnit)}/unità`));
  }
  meta.append(el('div', { class: 'voice-total' },
    'Totale voce: ',
    el('strong', {}, fmt(v.total)),
    v.type === 'unit' ? ` (${v.totalUnits} unità)` : ''));

  const table = el('table', { class: 'entries' });
  table.append(el('thead', {}, el('tr', {},
    el('th', {}, 'Data'),
    el('th', {}, v.type === 'unit' ? 'Unità' : 'Cifra'),
    el('th', {}, 'Importo'),
    el('th', {}, 'Nota'),
    el('th', {}, ''))));
  const tbody = el('tbody', {});
  for (const en of v.entries) {
    const detail = v.type === 'unit'
      ? `${en.value} unità × ${fmt(v.rate)}/unità${en.note ? ` — ${en.note}` : ''}`
      : `${fmt(en.value)}${en.note ? ` — ${en.note}` : ''}`;
    tbody.append(el('tr', {},
      el('td', {}, en.date),
      el('td', { class: 'num' }, String(en.value)),
      el('td', { class: 'num' }, fmt(en.amount)),
      el('td', {}, en.note || '—'),
      el('td', { class: 'actions' },
        el('a', { class: 'btn ghost small', href: gcalUrl(`${v.name} — ${fmt(en.amount)}`, en.date, detail), title: 'Aggiungi a Google Calendar' }, '🗓'),
        el('button', { class: 'btn danger small', 'data-action': 'del-entry', 'data-id': en.id, title: 'Elimina inserimento' }, '✕'))));
  }
  table.append(tbody);

  const form = el('form', { class: 'row-form entry-form', 'data-action': 'add-entry', 'data-id': v.id });
  form.append(
    el('input', { type: 'date', value: todayISO(), required: true }),
    el('input', { type: 'number', step: '0.01', min: '0.01', required: true, placeholder: v.type === 'unit' ? 'Unità' : 'Importo €', class: 'entry-value' }),
    el('input', { type: 'text', placeholder: 'Nota (opzionale)', maxlength: 200 }),
    el('button', { class: 'btn primary small', type: 'submit' }, '＋ Aggiungi'));

  card.append(head, meta, table, form);
  return card;
}

document.getElementById('new-expense-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const type = document.getElementById('ne-type').value;
  try {
    await api('POST', '/api/expenses', {
      name: document.getElementById('ne-name').value,
      type,
      costPerUnit: type === 'unit' ? Number(document.getElementById('ne-cost').value) : undefined,
    });
    e.target.reset();
    document.getElementById('ne-cost').classList.add('hidden');
    await load();
    toast('Voce di spesa aggiunta');
  } catch (err) {
    toast(err.message);
  }
});

document.getElementById('ne-type').addEventListener('change', (e) => {
  document.getElementById('ne-cost').classList.toggle('hidden', e.target.value !== 'unit');
});

document.getElementById('prev-month').addEventListener('click', () => {
  state.month = shiftMonth(state.month, -1);
  load().catch((err) => toast(err.message));
});
document.getElementById('next-month').addEventListener('click', () => {
  state.month = shiftMonth(state.month, 1);
  load().catch((err) => toast(err.message));
});
document.getElementById('today').addEventListener('click', () => {
  state.month = currentMonth();
  load().catch((err) => toast(err.message));
});

document.getElementById('voices').addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  const { action, id } = btn.dataset;
  try {
    if (action === 'del-voice') {
      if (!confirm('Eliminare la voce e tutti i suoi inserimenti?')) return;
      await api('DELETE', `/api/expenses/${id}`);
      await load();
      toast('Voce eliminata');
    } else if (action === 'del-entry') {
      await api('DELETE', `/api/entries/${id}`);
      await load();
    } else if (action === 'save-rate') {
      const input = btn.closest('.rate-wrap').querySelector('[data-role="rate-input"]');
      await api('PUT', `/api/expenses/${id}/rate`, { month: state.month, costPerUnit: Number(input.value) });
      await load();
      toast(`Tariffa aggiornata per ${monthLabel(state.month)}`);
    } else if (action === 'reset-rate') {
      await api('DELETE', `/api/expenses/${id}/rate?month=${state.month}`);
      await load();
      toast('Ripristinata la tariffa base');
    }
  } catch (err) {
    toast(err.message);
  }
});

document.getElementById('voices').addEventListener('submit', async (e) => {
  const form = e.target.closest('form[data-action="add-entry"]');
  if (!form) return;
  e.preventDefault();
  const [dateInput, valInput, noteInput] = form.querySelectorAll('input');
  try {
    await api('POST', '/api/entries', {
      expenseId: form.dataset.id,
      date: dateInput.value,
      value: Number(valInput.value),
      note: noteInput.value,
    });
    await load();
    toast('Inserimento aggiunto');
  } catch (err) {
    toast(err.message);
  }
});

// Versione a file singolo: .ics via download client-side + backup dati locali
if (window.__CASPER_EMBEDDED__ && window.__CASPER_API__) {
  document.getElementById('ics-link').addEventListener('click', (e) => {
    e.preventDefault();
    window.__CASPER_API__.downloadICS(state.month).catch((err) => toast(err.message));
  });
  const panel = document.getElementById('local-data-panel');
  if (panel) panel.classList.remove('hidden');
  document.getElementById('export-data').addEventListener('click', () => window.__CASPER_API__.downloadJSONFile());
  document.getElementById('import-data').addEventListener('click', () => document.getElementById('import-file').click());
  document.getElementById('import-file').addEventListener('change', async (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    try {
      await window.__CASPER_API__.importJSON(await f.text());
      await load();
      toast('Dati importati');
    } catch (err) {
      toast(err.message);
    }
    e.target.value = '';
  });
}

load().catch((err) => toast(err.message));

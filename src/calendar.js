(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./month'));
  else root.CasperCalendar = factory(root.CasperMonth);
})(typeof self !== 'undefined' ? self : this, function (month) {
  const { addDaysISO } = month;

  const eur = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });

  function escapeICS(text) {
    return String(text ?? '')
      .replace(/\\/g, '\\\\')
      .replace(/;/g, '\\;')
      .replace(/,/g, '\\,')
      .replace(/\r?\n/g, '\\n');
  }

  function icsDate(iso) {
    return iso.replaceAll('-', '');
  }

  function buildICS(events) {
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//casper//spese periodiche//IT', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
    for (const ev of events) {
      lines.push(
        'BEGIN:VEVENT',
        `UID:${ev.uid}`,
        `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${icsDate(ev.date)}`,
        `DTEND;VALUE=DATE:${icsDate(addDaysISO(ev.date, 1))}`,
        `SUMMARY:${escapeICS(ev.summary)}`,
      );
      if (ev.description) lines.push(`DESCRIPTION:${escapeICS(ev.description)}`);
      lines.push('END:VEVENT');
    }
    lines.push('END:VCALENDAR');
    return `${lines.join('\r\n')}\r\n`;
  }

  function googleCalendarUrl({ title, date, details }) {
    const params = new URLSearchParams({
      action: 'TEMPLATE',
      text: title,
      dates: `${icsDate(date)}/${icsDate(addDaysISO(date, 1))}`,
      details: details || '',
    });
    return `https://calendar.google.com/calendar/render?${params.toString()}`;
  }

  function entryEvent(expense, entry, amount) {
    const detail = expense.type === 'unit'
      ? `${entry.value} unità × ${eur.format(expense.rate ?? expense.costPerUnit)}/unità${entry.note ? ` — ${entry.note}` : ''}`
      : `${eur.format(entry.value)}${entry.note ? ` — ${entry.note}` : ''}`;
    return {
      uid: `${entry.id}@casper`,
      date: entry.date,
      summary: `${expense.name} — ${eur.format(amount)}`,
      description: detail,
    };
  }

  return { buildICS, googleCalendarUrl, entryEvent, escapeICS };
});

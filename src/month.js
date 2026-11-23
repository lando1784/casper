(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CasperMonth = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  function isValidMonth(month) {
    return typeof month === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(month);
  }

  function currentMonth(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }

  function shiftMonth(month, delta) {
    const [y, m] = month.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  function isValidDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const d = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
  }

  function monthOfDate(date) {
    return date.slice(0, 7);
  }

  function addDaysISO(date, days) {
    const d = new Date(`${date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    return d.toISOString().slice(0, 10);
  }

  function monthLabel(month) {
    const [y, m] = month.split('-').map(Number);
    return new Intl.DateTimeFormat('it-IT', { month: 'long', year: 'numeric' }).format(new Date(y, m - 1, 1));
  }

  return { isValidMonth, currentMonth, shiftMonth, isValidDate, monthOfDate, addDaysISO, monthLabel };
});

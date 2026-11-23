const fs = require('fs');
const path = require('path');
const { HttpError } = require('./errors');
const { isValidMonth, isValidDate, monthOfDate } = require('./month');

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

class Store {
  constructor(file) {
    this.file = file;
    this.data = { seq: 1, expenses: [], entries: [] };
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      this.data = { seq: 1, expenses: [], entries: [], ...parsed };
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
  }

  _save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    fs.renameSync(tmp, this.file);
  }

  effectiveRate(expense, month) {
    const override = expense.monthlyRates && expense.monthlyRates[month];
    return override != null ? override : expense.costPerUnit;
  }

  entryAmount(expense, entry) {
    if (expense.type === 'unit') return round2(entry.value * this.effectiveRate(expense, entry.month));
    return round2(entry.value);
  }

  getExpense(id) {
    const expense = this.data.expenses.find((x) => x.id === id);
    if (!expense) throw new HttpError(404, 'Voce di spesa non trovata');
    return expense;
  }

  getEntry(id) {
    const entry = this.data.entries.find((x) => x.id === id);
    if (!entry) throw new HttpError(404, 'Inserimento non trovato');
    return entry;
  }

  addExpense(input) {
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    if (!name) throw new HttpError(400, 'Il nome della voce è obbligatorio');
    if (input.type !== 'fixed' && input.type !== 'unit') {
      throw new HttpError(400, "Tipo non valido: usa 'fixed' (cifra) o 'unit' (costo/unità)");
    }
    let costPerUnit = null;
    if (input.type === 'unit') {
      costPerUnit = Number(input.costPerUnit);
      if (!Number.isFinite(costPerUnit) || costPerUnit < 0) {
        throw new HttpError(400, 'Costo/unità non valido (numero >= 0)');
      }
      costPerUnit = round2(costPerUnit);
    }
    const expense = {
      id: `exp_${this.data.seq++}`,
      name,
      type: input.type,
      costPerUnit,
      monthlyRates: {},
      createdAt: new Date().toISOString(),
    };
    this.data.expenses.push(expense);
    this._save();
    return expense;
  }

  updateExpense(id, input) {
    const expense = this.getExpense(id);
    if (input.name !== undefined) {
      const name = String(input.name).trim();
      if (!name) throw new HttpError(400, 'Il nome non può essere vuoto');
      expense.name = name;
    }
    if (input.costPerUnit !== undefined) {
      if (expense.type !== 'unit') throw new HttpError(400, 'Il costo/unità si applica solo alle voci di tipo unit');
      const cost = Number(input.costPerUnit);
      if (!Number.isFinite(cost) || cost < 0) throw new HttpError(400, 'Costo/unità non valido (numero >= 0)');
      expense.costPerUnit = round2(cost);
    }
    this._save();
    return expense;
  }

  deleteExpense(id) {
    this.getExpense(id);
    this.data.expenses = this.data.expenses.filter((x) => x.id !== id);
    this.data.entries = this.data.entries.filter((x) => x.expenseId !== id);
    this._save();
  }

  setRate(id, month, costPerUnit) {
    const expense = this.getExpense(id);
    if (expense.type !== 'unit') throw new HttpError(400, 'La tariffa mensile si applica solo alle voci di tipo unit');
    if (!isValidMonth(month)) throw new HttpError(400, 'Mese non valido (formato YYYY-MM)');
    const cost = Number(costPerUnit);
    if (!Number.isFinite(cost) || cost < 0) throw new HttpError(400, 'Tariffa non valida (numero >= 0)');
    expense.monthlyRates[month] = round2(cost);
    this._save();
    return { month, costPerUnit: expense.monthlyRates[month] };
  }

  deleteRate(id, month) {
    const expense = this.getExpense(id);
    if (!isValidMonth(month)) throw new HttpError(400, 'Mese non valido (formato YYYY-MM)');
    if (expense.monthlyRates[month] != null) {
      delete expense.monthlyRates[month];
      this._save();
    }
    return { month, costPerUnit: this.effectiveRate(expense, month) };
  }

  _validateValue(value) {
    const v = Number(value);
    if (!Number.isFinite(v) || v <= 0) throw new HttpError(400, 'Valore non valido (numero > 0)');
    return round2(v);
  }

  addEntry(input) {
    if (!input.expenseId) throw new HttpError(400, 'expenseId obbligatorio');
    const expense = this.getExpense(input.expenseId);
    const date = String(input.date || '');
    if (!isValidDate(date)) throw new HttpError(400, 'Data non valida (formato YYYY-MM-DD)');
    const value = this._validateValue(input.value);
    const note = input.note != null ? String(input.note).slice(0, 500) : '';
    const entry = {
      id: `ent_${this.data.seq++}`,
      expenseId: expense.id,
      date,
      month: monthOfDate(date),
      value,
      note,
      createdAt: new Date().toISOString(),
    };
    this.data.entries.push(entry);
    this._save();
    return entry;
  }

  updateEntry(id, input) {
    const entry = this.getEntry(id);
    if (input.value !== undefined) entry.value = this._validateValue(input.value);
    if (input.date !== undefined) {
      const date = String(input.date);
      if (!isValidDate(date)) throw new HttpError(400, 'Data non valida (formato YYYY-MM-DD)');
      entry.date = date;
      entry.month = monthOfDate(date);
    }
    if (input.note !== undefined) entry.note = String(input.note).slice(0, 500);
    this._save();
    return entry;
  }

  deleteEntry(id) {
    this.getEntry(id);
    this.data.entries = this.data.entries.filter((x) => x.id !== id);
    this._save();
  }

  monthState(month) {
    const expenses = this.data.expenses.map((expense) => {
      const entries = this.data.entries
        .filter((entry) => entry.expenseId === expense.id && entry.month === month)
        .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
        .map((entry) => ({ ...entry, amount: this.entryAmount(expense, entry) }));
      const total = round2(entries.reduce((sum, entry) => sum + entry.amount, 0));
      const totalUnits = expense.type === 'unit' ? round2(entries.reduce((sum, entry) => sum + entry.value, 0)) : null;
      return {
        id: expense.id,
        name: expense.name,
        type: expense.type,
        costPerUnit: expense.costPerUnit,
        rate: expense.type === 'unit' ? round2(this.effectiveRate(expense, month)) : null,
        hasMonthOverride: expense.type === 'unit' && expense.monthlyRates[month] != null,
        entries,
        totalUnits,
        total,
      };
    });
    const total = round2(expenses.reduce((sum, expense) => sum + expense.total, 0));
    return { month, expenses, total };
  }
}

module.exports = { Store, round2 };

const fs = require('fs');
const path = require('path');
const { Domain, round2 } = require('./domain');

// Store lato server: stesso dominio (Domain) con persistenza su file JSON
// (scrittura atomica via file temporaneo + rename).
class Store extends Domain {
  constructor(file) {
    super();
    this.file = file;
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      this.data = { seq: 1, expenses: [], entries: [], ...parsed };
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
  }

  _persist() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    fs.renameSync(tmp, this.file);
  }
}

module.exports = { Store, round2 };

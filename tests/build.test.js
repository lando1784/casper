const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

test('build: dist/casper.html è un file singolo completo e valido', () => {
  const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'casper-build-')), 'casper.html');
  execFileSync(process.execPath, [path.join(__dirname, '..', 'scripts', 'build-single-html.js'), out], { stdio: 'pipe' });
  const html = fs.readFileSync(out, 'utf8');

  // flag embedded + adapter + dominio nel bundle
  assert.match(html, /window\.__CASPER_EMBEDDED__ = true/);
  assert.match(html, /CasperEmbedded/);
  assert.match(html, /class Domain/);
  // niente riferimenti esterni
  assert.ok(!html.includes('<script src='), 'trovato <script src= esterno');
  assert.ok(!html.includes('href="/style.css"'), 'trovato link CSS esterno');
  assert.ok(!html.includes('rel="manifest"'), 'trovato manifest esterno');
  // CSS inline e favicon inline
  assert.match(html, /<style>/);
  assert.match(html, /data:image\/png;base64,/);
  // panneau backup dati presente
  assert.match(html, /local-data-panel/);

  // tutti gli <script> inline devono essere sintatticamente validi
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  assert.ok(scripts.length >= 1, 'mancano gli script inline');
  for (const code of scripts) {
    // parse-only: non esegue il codice (usa document/window)
    new Function(code);
  }
});

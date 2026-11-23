#!/usr/bin/env node
// Genera dist/casper.html: tutta l'app (HTML+CSS+JS+dominio+adapter localStorage)
// in un unico file aprível da solo, anche da file:// su smartphone.
// Uso: node scripts/build-single-html.js [percorso-output]
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const outFile = process.argv[2] || path.join(root, 'dist', 'casper.html');

let html = read('public/index.html');
const css = read('public/style.css');
const icon192 = fs.readFileSync(path.join(root, 'public/icons/icon-192.png')).toString('base64');

// CSS inline
html = html.replace('<link rel="stylesheet" href="/style.css">', () => `<style>\n${css}\n</style>`);
// Favicon inline come data URI (l'icona resta nel file)
html = html.replace('<link rel="icon" href="/icons/icon-192.png">', () => `<link rel="icon" href="data:image/png;base64,${icon192}">`);
html = html.replace('<link rel="apple-touch-icon" href="/icons/icon-192.png">', '');
// In un file singolo niente manifest PWA né service worker (servono HTTP)
html = html.replace('<link rel="manifest" href="/manifest.webmanifest">', '');
html = html.replace(/<script>\s*if \('serviceWorker'[\s\S]*?<\/script>/, '');

// Bundle JS: dominio condiviso + adapter embedded + app
const bundle = [
  'window.__CASPER_EMBEDDED__ = true;',
  read('src/errors.js'),
  read('src/month.js'),
  read('src/calendar.js'),
  read('src/domain.js'),
  read('public/embedded-api.js'),
  'window.__CASPER_API__ = CasperEmbedded.createApi(window.localStorage);',
  read('public/app.js'),
].join('\n;\n');

html = html.replace('<script src="/app.js"></script>', () => `<script>\n${bundle}\n</script>`);

if (html.includes('<script src=') || html.includes('href="/style.css"') || html.includes('rel="manifest"')) {
  throw new Error('build incompleta: rimangono riferimenti esterni');
}

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, html);
console.log(`generato ${outFile} (${(fs.statSync(outFile).size / 1024).toFixed(1)} KB)`);

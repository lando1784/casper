# casper

Web app for periodic family expenses (spese periodiche di casa).

Nessuna dipendenza esterna: server Node.js (moduli built-in) + frontend statico in vanilla JS, dati salvati in un file JSON.

## Avvio

```bash
npm start          # http://localhost:3000
npm test           # test automatici (node:test)
```

Configurabili via env: `PORT` (default 3000), `DATA_FILE` (default `data/db.json`).

## Funzionalità

- **Voci di spesa** con criterio a scelta:
  - `fixed` — cifra in €;
  - `unit` — costo/unità impostato alla creazione e **modificabile per singolo mese** (override mensile; senza override si usa la tariffa base).
- **Inserimenti** (cifre o unità) con data e nota; per le voci `unit` l'importo è calcolato come `unità × costo/unità del mese`.
- **Totale mensile** per singola voce e complessivo, con navigazione mese precedente/successivo.
- **Google Calendar** (opzionale, senza credenziali lato server):
  - pulsante 🗓 su ogni inserimento → apre Google Calendar con l'evento precompilato;
  - esportazione del mese in `.ics` (`/api/calendar.ics?month=YYYY-MM`) da importare in Google Calendar (Impostazioni → Importa).

## API

| Metodo | Endpoint | Descrizione |
| --- | --- | --- |
| GET | `/api/state?month=YYYY-MM` | voci + inserimenti + totali del mese |
| POST | `/api/expenses` | `{name, type: "fixed"\|"unit", costPerUnit?}` |
| PATCH | `/api/expenses/:id` | `{name?, costPerUnit?}` (tariffa base) |
| DELETE | `/api/expenses/:id` | elimina voce e inserimenti |
| PUT | `/api/expenses/:id/rate` | `{month, costPerUnit}` — tariffa del mese |
| DELETE | `/api/expenses/:id/rate?month=YYYY-MM` | rimuove l'override mensile |
| POST | `/api/entries` | `{expenseId, date: "YYYY-MM-DD", value, note?}` |
| PATCH | `/api/entries/:id` | `{value?, date?, note?}` |
| DELETE | `/api/entries/:id` | elimina inserimento |
| GET | `/api/entries/:id/google` | URL "Aggiungi a Google Calendar" |
| GET | `/api/calendar.ics?month=YYYY-MM` | esportazione iCalendar del mese |
| GET | `/api/health` | stato del server |

## Uso da smartphone (Android)

L'app è **responsive** e installabile come PWA (manifest + service worker + icone):

1. Avvia il server sul PC: `npm start` (ascolta su tutte le interfacce, porta 3000).
2. Dal telefono Android, stessa rete Wi-Fi, apri `http://<IP-del-PC>:3000` (es. `http://192.168.1.10:3000`).
3. Menu Chrome → **Aggiungi a schermata Home** (o "Installa app"): icona del fantasmino, apertura a schermo intero, funzionamento offline per la parte statica (i dati restano sul server; le API usano la rete con fallback alla cache).

Nota: l'installazione standalone completa (senza barra del browser) su Chrome Android richiede un **contesto sicuro (HTTPS)**; in HTTP su rete locale ottieni comunque la scorciatoia nella home. Per HTTPS in casa puoi usare un reverse proxy locale con certificato (es. Caddy) oppure un tunnel.

### Server locale direttamente sul telefono (Termux, senza PC)

Con [Termux](https://f-droid.org/packages/com.termux/) (da F-Droid) il server Node gira **sul telefono stesso**: dati e app restano sul dispositivo.

```bash
# dentro Termux
pkg update -y && pkg install -y nodejs git
git clone https://github.com/lando1784/casper.git ~/casper
sh ~/casper/scripts/termux-setup.sh     # aggiorna il repo e avvia il server
# in alternativa, se hai copiato la cartella via USB/condivisione: sh scripts/termux-setup.sh
```

Poi apri Chrome sul telefono su **http://localhost:3000**: `localhost` è un *contesto sicuro*, quindi service worker e installazione PWA funzionano in plein (menu → **Installa app** / **Aggiungi a schermata Home**, apertura standalone, cache offline).

- `termux-wake-lock` (incluso nello script, se disponibile) impedisce al telefono di sospendere il server a schermo spento.
- I dati vivono in `~/casper/data/db.json` — per un backup copia la cartella `data/`.
- `npm test` esegue i test anche sul telefono; `npm start` (o `sh scripts/start.sh`) riavvia il server.
- All'avvio il server stampa anche `http://<IP-del-telefono>:3000`, utile per raggiungere l'app da altri dispositivi della stessa Wi-Fi.

## File singolo da condividere (una sola pagina HTML)

Per usarla senza server (es. sul telefono di un familiare) si può generare **un unico file HTML** con tutta l'app dentro:

```bash
npm run build:single     # genera dist/casper.html (~35 KB)
```

`dist/casper.html` è autosufficiente: HTML + CSS + JS + logica dati in un solo file.

- Inviarlo via WhatsApp/Drive/email e aprirlo con **Chrome** sul telefono Android.
- I dati restano nel browser del dispositivo (`localStorage`); pulsanti **Esporta/Importa dati (.json)** nel pannello "Dati locali" servono per backup e cambio telefono.
- Funzionano anche offline (è un file locale), i pulsanti 🗓 Google Calendar e l'esportazione `.ics` del mese.
- Da `file://` non è installabile come PWA (serve HTTP), ma Chrome permette "Aggiungi a schermata Home" come icona. Per la PWA completa basta copiare il file in `public/` e aprirlo via server: `cp dist/casper.html public/` → `http://localhost:3000/casper.html`.

### Release con artifact pronto da scaricare

Il workflow `.github/workflows/release.yml` scatta alla **pubblicazione di una release** (`on: release: [published]`): esegue i test, compila `dist/casper.html` e lo **allega come asset della release** (con `contents: write` sul `GITHUB_TOKEN`, re-upload con `--clobber`).

```bash
gh release create v1.0.0 --title "casper v1.0.0" --generate-notes
# dopo qualche secondo: https://github.com/lando1784/casper/releases/tag/v1.0.0
# → asset "casper.html" scaricabile, da mandare a anyone via WhatsApp/Drive
```

## Struttura

```
server.js          entry point
src/app.js         router HTTP + API REST + static
src/store.js       dominio e persistenza JSON (scrittura atomica)
src/month.js       utilità su mesi/date
src/calendar.js    generazione .ics e link Google Calendar
src/errors.js      HttpError
public/            frontend (index.html, app.js, style.css, sw.js, manifest, icone)
scripts/           start.sh, termux-setup.sh (Android), build-single-html.js (file singolo)
dist/              output di build:single (gitignored)
tests/             test API end-to-end
```

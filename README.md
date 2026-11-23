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

## Struttura

```
server.js          entry point
src/app.js         router HTTP + API REST + static
src/store.js       dominio e persistenza JSON (scrittura atomica)
src/month.js       utilità su mesi/date
src/calendar.js    generazione .ics e link Google Calendar
src/errors.js      HttpError
public/            frontend (index.html, app.js, style.css)
tests/             test API end-to-end
```

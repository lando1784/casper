#!/data/data/com.termux/files/usr/bin/sh
# Setup e avvio di casper su Android via Termux (https://f-droid.org/packages/com.termux/)
# Uso:   sh scripts/termux-setup.sh        (dopo aver copiato la cartella del repo in Termux)
# oppure cloned direttamente dal telefono:
#   pkg update -y && pkg install -y nodejs git
#   git clone https://github.com/lando1784/casper.git ~/casper
#   sh ~/casper/scripts/termux-setup.sh
set -e

REPO_URL="https://github.com/lando1784/casper.git"
DEST="$HOME/casper"

if ! command -v node >/dev/null 2>&1; then
  echo ">> installo nodejs e git..."
  pkg update -y
  pkg install -y nodejs git
fi

if [ -d "$DEST/.git" ]; then
  echo ">> aggiorno $DEST"
  git -C "$DEST" pull --ff-only
else
  echo ">> clono il repo in $DEST"
  rm -rf "$DEST"
  git clone "$REPO_URL" "$DEST"
fi

cd "$DEST"

# Impedisce al telefono di sospendere il server a schermo spento (se disponibile)
termux-wake-lock 2>/dev/null || echo ">> termux-wake-lock non disponibile: avvia con 'termux-wake-lock && npm start' per tenerlo attivo"

echo ">> avvio casper: apri http://localhost:3000 sul telefono"
exec node server.js

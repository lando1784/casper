#!/bin/sh
# Avvia casper localmente (PC o Termux su Android). Nessuna dipendenza da installare.
cd "$(dirname "$0")/.." || exit 1
exec node server.js

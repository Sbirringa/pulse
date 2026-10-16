#!/usr/bin/env python3
"""Ripulisce i contenuti di un utente di Pulse (in locale), anche con Pulse accesa.

Dalla cartella del progetto:
    backend\\.venv\\Scripts\\python tools\\pulisci.py            elenco utenti con quanto hanno pubblicato
    backend\\.venv\\Scripts\\python tools\\pulisci.py mario     riepilogo di @mario e menu:
        1) cancella post, commenti, sondaggi e voti (l'account resta)
        2) cancella solo i voti
        3) elimina l'account intero
Chiede sempre di riscrivere il nome utente prima di cancellare.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from app.cleanup_cli import main  # noqa: E402

if __name__ == "__main__":
    sys.exit(main())

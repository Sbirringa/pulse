#!/usr/bin/env python3
"""Rende amministratore un utente di PULSE (in locale).

Dalla cartella del progetto, con PULSE anche accesa:
    backend\\.venv\\Scripts\\python tools\\make_admin.py tuo_nome_utente
    backend\\.venv\\Scripts\\python tools\\make_admin.py tuo_nome_utente --rimuovi
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from app.admin_cli import main  # noqa: E402

if __name__ == "__main__":
    sys.exit(main())

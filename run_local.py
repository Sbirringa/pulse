#!/usr/bin/env python3
"""Avvia PULSE in locale con un solo comando (Windows, macOS, Linux).

    python run_local.py          # prepara tutto, compila il frontend e avvia su http://127.0.0.1:8000
    python run_local.py --dev    # come sopra, ma con hot reload (frontend su http://127.0.0.1:5173)
    python run_local.py --skip-build

Senza DATABASE_URL usa SQLite (backend/data/pulse.db): non serve installare nulla.
Per provare Neon in locale:  $env:DATABASE_URL = "postgresql://..."   (PowerShell)
"""
import argparse
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent
BACKEND = ROOT / "backend"
FRONTEND = ROOT / "frontend"
IS_WIN = os.name == "nt"
VENV_PY = BACKEND / ".venv" / ("Scripts/python.exe" if IS_WIN else "bin/python")


def step(msg: str) -> None:
    print(f"\n\033[92m▶ {msg}\033[0m" if not IS_WIN else f"\n>> {msg}", flush=True)


def run(cmd: list[str], cwd: Path, **kw) -> None:
    subprocess.run(cmd, cwd=cwd, check=True, **kw)


def need(tool: str, hint: str) -> str:
    path = shutil.which(tool)
    if not path:
        sys.exit(f"Manca '{tool}'. {hint}")
    return path


# file di versioni precedenti: estraendo lo zip sopra la vecchia cartella resterebbero lì e romperebbero la compilazione
OBSOLETE = [
    "frontend/src/components/ProposeTab.tsx",
    "frontend/src/components/GuestPolls.tsx",
    "frontend/src/components/SwipeDeck.tsx",
    "frontend/src/components/ResultsPanel.tsx",
]


def remove_obsolete() -> None:
    for rel in OBSOLETE:
        f = ROOT / rel
        if f.exists():
            f.unlink()
            print(f"   tolto il vecchio file {rel}")


def main() -> None:
    remove_obsolete()
    ap = argparse.ArgumentParser()
    ap.add_argument("--dev", action="store_true", help="hot reload: backend + vite dev server")
    ap.add_argument("--skip-build", action="store_true", help="non ricompilare il frontend")
    ap.add_argument("--port", type=int, default=8000)
    args = ap.parse_args()

    npm = need("npm", "Installa Node.js LTS da https://nodejs.org")

    step("Ambiente Python (backend/.venv)")
    if not VENV_PY.exists():
        run([sys.executable, "-m", "venv", ".venv"], BACKEND)
    stamp = BACKEND / ".venv" / ".requirements-stamp"
    req = BACKEND / "requirements.txt"
    if not stamp.exists() or stamp.stat().st_mtime < req.stat().st_mtime:
        run([str(VENV_PY), "-m", "pip", "install", "--upgrade", "pip", "-q"], BACKEND)
        run([str(VENV_PY), "-m", "pip", "install", "-r", "requirements.txt", "-q"], BACKEND)
        stamp.touch()

    step("Dipendenze frontend")
    # si reinstallano anche quando cambia l'elenco delle librerie (es. dopo un aggiornamento di PULSE)
    npm_stamp = FRONTEND / "node_modules" / ".pulse-stamp"
    lock = FRONTEND / "package-lock.json"
    if not npm_stamp.exists() or npm_stamp.stat().st_mtime < lock.stat().st_mtime:
        run([npm, "install"], FRONTEND)
        npm_stamp.touch()

    env = os.environ.copy()
    env.setdefault("PULSE_ENV", "development")
    # impostazioni personali (titolare privacy, email, link GitHub…) dal file pulse.env, se c'è
    conf = ROOT / "pulse.env"
    if conf.exists():
        for line in conf.read_text(encoding="utf-8-sig").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, value = line.split("=", 1)
                env.setdefault(key.strip(), value.strip().strip('"').strip("'"))
        print(f"   impostazioni lette da {conf.name}")

    if args.dev:
        step("Avvio in modalità sviluppo → apri http://127.0.0.1:5173  (Ctrl+C per fermare)")
        api = subprocess.Popen(
            [str(VENV_PY), "-m", "uvicorn", "app.main:app", "--reload", "--port", str(args.port)],
            cwd=BACKEND, env=env,
        )
        web = subprocess.Popen([npm, "run", "dev"], cwd=FRONTEND, env=env)
        try:
            while api.poll() is None and web.poll() is None:
                time.sleep(0.5)
        except KeyboardInterrupt:
            pass
        finally:
            for p in (api, web):
                if p.poll() is None:
                    p.terminate()
        return

    if not args.skip_build or not (FRONTEND / "dist").exists():
        step("Compilo il frontend")
        run([npm, "run", "build"], FRONTEND)

    step(f"PULSE è pronta → apri http://127.0.0.1:{args.port}  (Ctrl+C per fermare)")
    try:
        run(
            [str(VENV_PY), "-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", str(args.port)],
            BACKEND, env=env,
        )
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()

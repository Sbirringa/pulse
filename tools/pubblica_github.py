"""Pulse su GitHub (repository pubblico), con controllo dei segreti prima di ogni invio.

Lancialo dalla cartella pulse:   python tools\\pubblica_github.py

Cosa fa:
  1. controlla che .gitignore escluda chiavi, database, pulse.env e file di lavoro;
  2. prepara i file e li CONTROLLA uno per uno: se trova una chiave, una password o un database si ferma
     e non pubblica niente;
  3. usa come autore il tuo indirizzo "noreply" di GitHub (la tua email vera non finisce nel codice pubblico);
  4. invia il codice al repository che hai creato su GitHub;
  5. collega il pulsante «Vedi il codice su GitHub» dell'app online.
Si può rilanciare: la seconda volta pubblica solo le modifiche.
"""
import re
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# file che non devono MAI finire su GitHub
IGNORE = [
    ".venv/", "__pycache__/", "*.pyc", ".pytest_cache/", "node_modules/", "frontend/dist/",
    "backend/data/", "*.db", "*.sqlite", "*.sqlite3", ".datakey", ".secret", ".env", "pulse.env",
    "Pulse-CHIAVI*", "*.zip", "*.bak", "*.log", "aggiorna_*.py",
]
BAD_NAMES = re.compile(r"(^|/)(\.datakey|\.secret|\.env|pulse\.env|Pulse-CHIAVI[^/]*)$|\.(db|sqlite3?|bak|zip)$", re.I)
SECRETS = [
    (re.compile(r"npg_[A-Za-z0-9]{8,}"), "password di Neon"),
    (re.compile(r"postgres(?:ql)?(?:\+psycopg)?://[^\s:/'\"]+:(?!pass@|password@|\.\.\.|PASSWORD|utente)[^@\s'\"]{6,}@"), "connection string con password"),
    (re.compile(r"\btid_[A-Za-z0-9]{10,}"), "chiave di Tigris"),
    (re.compile(r"\btsec_[A-Za-z0-9]{10,}"), "chiave di Tigris"),
    (re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----"), "chiave privata"),
    (re.compile(r"(?m)^\s*(SECRET_KEY|ADMIN_KEY|PULSE_DATA_KEY|AWS_SECRET_ACCESS_KEY)\s*=\s*['\"]?[A-Za-z0-9_\-]{20,}"), "chiave dell'app"),
    (re.compile(r"\bFlyV1 [A-Za-z0-9_,=+/\-]{20,}|\bfm2_[A-Za-z0-9_\-]{20,}"), "token di Fly"),
    (re.compile(r"\bgh[pousr]_[A-Za-z0-9]{30,}"), "token di GitHub"),
]


def title(t: str) -> None:
    print(f"\n=== {t} ===")


def git(*args: str, check: bool = True, capture: bool = True) -> str:
    r = subprocess.run(["git", *args], cwd=ROOT, text=True, capture_output=capture, encoding="utf-8", errors="replace")
    if check and r.returncode != 0:
        sys.exit(f"\nIl comando `git {' '.join(args)}` non è andato a buon fine:\n{(r.stdout or '') + (r.stderr or '')}\n"
                 "Leggi il messaggio qui sopra per capire cosa non ha funzionato.")
    return (r.stdout or "").strip()


def yes(q: str) -> bool:
    return input(f"{q} (s/n): ").strip().lower() in ("s", "si", "sì", "y", "yes")


def fly_app() -> str:
    m = re.search(r'(?m)^app = "([^"]+)"', (ROOT / "fly.toml").read_text(encoding="utf-8"))
    return m.group(1) if m else ""


def main() -> None:
    if not (ROOT / "fly.toml").exists() or not (ROOT / "backend").is_dir():
        sys.exit("Lancia lo script dalla cartella pulse:  cd $env:USERPROFILE\\pulse ; python tools\\pubblica_github.py")
    if not shutil.which("git"):
        sys.exit("Git non è installato. Scaricalo da https://git-scm.com/download/win (opzioni predefinite), "
                 "chiudi e riapri PowerShell, poi rilancia lo script.")
    if not (ROOT / "LICENSE").exists():
        sys.exit("Manca il file LICENSE: estrai prima l'ultimo pulse.zip nella cartella pulse.")

    title("1/5 File da escludere")
    gi = ROOT / ".gitignore"
    lines = gi.read_text(encoding="utf-8").splitlines() if gi.exists() else []
    missing = [p for p in IGNORE if p not in lines]
    if missing:
        gi.write_text("\n".join(lines + ["", "# segreti e file di lavoro: mai su GitHub"] + missing) + "\n", encoding="utf-8")
        print("Aggiunti a .gitignore: " + ", ".join(missing))
    else:
        print(".gitignore già completo.")

    title("2/5 Repository locale")
    if not (ROOT / ".git").exists():
        git("init")
        git("checkout", "-B", "main")
        print("Creato il repository locale.")
    user = git("config", "--local", "--get", "pulse.githubuser", check=False)
    while not user:
        u = input("Il tuo nome utente GitHub (quello che compare in github.com/NOME): ").strip().lstrip("@")
        if re.fullmatch(r"[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})", u):
            user = u
    git("config", "--local", "pulse.githubuser", user)
    # autore dei commit: indirizzo noreply di GitHub, così la tua email non diventa pubblica
    git("config", "--local", "user.name", user)
    git("config", "--local", "user.email", f"{user}@users.noreply.github.com")
    git("config", "--local", "core.autocrlf", "true")
    print(f"Autore dei commit: {user} <{user}@users.noreply.github.com>")

    title("3/5 Controllo dei segreti")
    git("add", "-A")
    files = [f for f in git("diff", "--cached", "--name-only").splitlines() if f]
    tracked = [f for f in git("ls-files").splitlines() if f]
    problems = []
    for f in sorted(set(tracked)):
        if BAD_NAMES.search(f):
            problems.append(f"{f}: file che non deve essere pubblicato")
            continue
        p = ROOT / f
        if not p.is_file():
            continue
        if p.stat().st_size > 5_000_000:
            problems.append(f"{f}: file troppo grande ({p.stat().st_size // 1_000_000} MB)")
            continue
        try:
            text = p.read_text(encoding="utf-8")
        except (UnicodeDecodeError, OSError):
            continue
        for rx, what in SECRETS:
            if rx.search(text):
                problems.append(f"{f}: contiene una {what}")
    if problems:
        git("reset", "-q")
        print("\n⛔ Mi fermo, non pubblico niente. Ho trovato:")
        for x in problems:
            print("   - " + x)
        sys.exit("\nTogli quei file o quei testi e rilancia lo script.")
    print(f"Controllati {len(tracked)} file: nessuna chiave, password o database. ✅")

    if files:
        print(f"File nuovi o modificati da pubblicare: {len(files)}")
        if not yes("Procedo con la pubblicazione?"):
            git("reset", "-q")
            sys.exit("Fermato. Non ho pubblicato niente.")
        first = git("rev-parse", "--verify", "HEAD", check=False) == ""
        git("commit", "-q", "-m", "Pulse: prima pubblicazione" if first else "Aggiornamento di Pulse")
    else:
        print("Nessuna modifica da pubblicare.")

    title("4/5 Invio a GitHub")
    remote = git("remote", "get-url", "origin", check=False)
    if not remote:
        print(f"""
Crea il repository su GitHub (una volta sola):
  1. apri  https://github.com/new
  2. Repository name:  pulse
  3. scegli  Public
  4. NON spuntare README, .gitignore né licenza (li abbiamo già)
  5. premi  Create repository
""")
        while not remote:
            u = input("Incolla qui il link del repository (es. https://github.com/" + user + "/pulse): ").strip().rstrip("/")
            u = u[:-4] if u.endswith(".git") else u
            if re.fullmatch(r"https://github\.com/[A-Za-z0-9-]+/[A-Za-z0-9._-]+", u):
                remote = u + ".git"
            else:
                print("Il link deve essere tipo https://github.com/nome/pulse")
        git("remote", "add", "origin", remote)
    print("Invio in corso. Se si apre una finestra di GitHub, accedi e autorizza: serve solo la prima volta.")
    git("push", "-u", "origin", "main", capture=False)
    web = remote[:-4] if remote.endswith(".git") else remote
    print(f"\n✅ Codice pubblicato: {web}")

    title("5/5 Pulsante «Vedi il codice su GitHub»")
    env = ROOT / "pulse.env"
    if env.exists():
        txt = env.read_text(encoding="utf-8")
        if re.search(r"(?m)^PULSE_SOURCE_URL=", txt):
            txt = re.sub(r"(?m)^PULSE_SOURCE_URL=.*$", f"PULSE_SOURCE_URL={web}", txt)
        else:
            txt = txt.rstrip() + f"\nPULSE_SOURCE_URL={web}\n"
        env.write_text(txt, encoding="utf-8")
        print("Collegato in locale (pulse.env).")
    app = fly_app()
    fly = shutil.which("fly") or shutil.which("flyctl") or str(Path.home() / ".fly" / "bin" / "flyctl.exe")
    if app and Path(fly).exists() and yes(f"Collego il link anche all'app online ({app}) e la aggiorno?"):
        subprocess.run([fly, "secrets", "set", "--stage", f"PULSE_SOURCE_URL={web}", "-a", app], cwd=ROOT, check=False)
        r = subprocess.run([fly, "deploy", "-a", app, "--ha=false"], cwd=ROOT)
        print("\n✅ App online aggiornata." if r.returncode == 0 else "\nL'aggiornamento online non è riuscito: leggi il messaggio qui sopra.")
    print(f"""
Fatto. Da ora, dopo ogni aggiornamento:
  python tools\\pubblica_github.py     → pubblica le modifiche su GitHub (con il controllo dei segreti)
  fly deploy --ha=false               → aggiorna l'app online
""")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nInterrotto. Puoi rilanciare lo script quando vuoi.")

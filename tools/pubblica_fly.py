"""Pulse online su Fly.io + Neon, passo passo.

Lancialo dalla cartella pulse:   python tools\\pubblica_fly.py

Cosa fa:
  1. crea le chiavi segrete UNA volta sola e le salva FUORI dalla cartella pulse
     (C:\\Users\\<te>\\PULSE-CHIAVI-PRIVATE.txt): se rilanci lo script le riusa, non le cambia mai;
  2. crea l'app su Fly con il nome che scegli (il link sarà https://NOME.fly.dev);
  3. passa a Fly i segreti (database Neon, chiavi, titolare, email) senza scriverli nella cronologia;
  4. crea l'archivio per le foto (Tigris);
  5. pubblica l'app e controlla che risponda.
Si può rilanciare senza problemi: salta i passi già fatti.
"""
import getpass
import json
import re
import secrets
import shutil
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
KEYS = Path.home() / "PULSE-CHIAVI-PRIVATE.txt"
FLY_TOML = ROOT / "fly.toml"


def title(t: str) -> None:
    print(f"\n=== {t} ===")


def fly_exe() -> str:
    for name in ("fly", "flyctl"):
        p = shutil.which(name)
        if p:
            return p
    p = Path.home() / ".fly" / "bin" / "flyctl.exe"
    if p.exists():
        return str(p)
    sys.exit("Non trovo il comando fly. Chiudi e riapri PowerShell, oppure reinstallalo: iwr https://fly.io/install.ps1 -useb | iex")


FLY = fly_exe()


def fly(*args: str, capture: bool = False, stdin: str | None = None, check: bool = True) -> subprocess.CompletedProcess:
    r = subprocess.run([FLY, *args], cwd=ROOT, text=True, input=stdin,
                       capture_output=capture or stdin is not None, encoding="utf-8", errors="replace")
    if check and r.returncode != 0:
        out = (r.stdout or "") + (r.stderr or "")
        sys.exit(f"\nIl comando `fly {' '.join(a for a in args)}` non è andato a buon fine.\n{out.strip()}\n"
                 "Leggi il messaggio qui sopra per capire cosa non ha funzionato.")
    return r


def read_kv(path: Path) -> dict[str, str]:
    out: dict[str, str] = {}
    if path.exists():
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                out[k.strip()] = v.strip().strip('"')
    return out


def ask(prompt: str, default: str = "") -> str:
    v = input(f"{prompt}{f' [{default}]' if default else ''}: ").strip()
    return v or default


def main() -> None:
    if not (ROOT / "Dockerfile").exists() or not FLY_TOML.exists():
        sys.exit("Lancia lo script dalla cartella pulse:  cd $env:USERPROFILE\\pulse ; python tools\\pubblica_fly.py")

    title("1/6 Accesso a Fly")
    who = fly("auth", "whoami", capture=True, check=False)
    if who.returncode != 0:
        sys.exit("Non sei collegato a Fly da PowerShell. Esegui:  fly auth login  e poi rilancia lo script.")
    print(f"Collegato come: {who.stdout.strip()}")

    keys = read_kv(KEYS)
    title("2/6 Chiavi segrete")
    if keys.get("PULSE_DATA_KEY"):
        print(f"Uso le chiavi già create in {KEYS} (non le cambio mai).")
    else:
        keys.update({
            "SECRET_KEY": secrets.token_urlsafe(48),
            "ADMIN_KEY": secrets.token_urlsafe(32),
            "PULSE_DATA_KEY": secrets.token_urlsafe(32),
        })
        print("Chiavi nuove create.")

    # nome dell'app = indirizzo del sito
    name = keys.get("FLY_APP", "")
    while not name:
        n = ask("Nome per il link (minuscole, numeri e trattini, es. pulse-italia)").lower()
        if not re.fullmatch(r"[a-z][a-z0-9-]{1,40}[a-z0-9]", n):
            print("Usa solo lettere minuscole, numeri e trattini (3-42 caratteri), senza spazi.")
            continue
        name = n
    keys["FLY_APP"] = name

    # Neon
    url = keys.get("DATABASE_URL", "")
    while not url:
        print("\nIncolla la connection string di Neon (inizia con postgresql://). Per sicurezza non si vede mentre incolli:")
        u = getpass.getpass("> ").strip().strip('"').strip("'")
        if u.startswith("psql "):
            u = u[5:].strip().strip("'\"")
        if not u.startswith(("postgresql://", "postgres://")) or "neon.tech" not in u:
            print("Non sembra una connection string di Neon (deve iniziare con postgresql:// e contenere neon.tech). Riprova.")
            continue
        if "****" in u:
            print("La password è nascosta (****): in Neon premi «Show password» prima di copiare. Riprova.")
            continue
        url = u
    keys["DATABASE_URL"] = url

    local = read_kv(ROOT / "pulse.env")
    keys["PULSE_CONTROLLER_NAME"] = keys.get("PULSE_CONTROLLER_NAME") or ask(
        "Titolare del trattamento", local.get("PULSE_CONTROLLER_NAME", ""))
    keys["PULSE_CONTACT_EMAIL"] = keys.get("PULSE_CONTACT_EMAIL") or ask(
        "Email per privacy e segnalazioni", local.get("PULSE_CONTACT_EMAIL", ""))
    if not keys["PULSE_CONTROLLER_NAME"] or "@" not in keys["PULSE_CONTACT_EMAIL"]:
        sys.exit("Servono titolare ed email valide. Rilancia lo script.")

    KEYS.write_text(
        "# Pulse - CHIAVI PRIVATE. Copia tutto nel tuo password manager.\n"
        "# Non metterle su GitHub e non mandarle a nessuno. Senza PULSE_DATA_KEY i dati cifrati sono persi per sempre.\n"
        + "".join(f"{k}={v}\n" for k, v in keys.items()), encoding="utf-8")
    print(f"Chiavi salvate in: {KEYS}")

    title("3/6 App su Fly")
    exists = fly("status", "-a", name, capture=True, check=False).returncode == 0
    if exists:
        print(f"L'app {name} esiste già: la riuso.")
    else:
        r = fly("apps", "create", name, "-o", "personal", capture=True, check=False)
        if r.returncode != 0:
            msg = (r.stdout or "") + (r.stderr or "")
            if "taken" in msg.lower() or "already" in msg.lower():
                keys.pop("FLY_APP")
                KEYS.write_text("# Pulse - CHIAVI PRIVATE.\n" + "".join(f"{k}={v}\n" for k, v in keys.items()), encoding="utf-8")
                sys.exit(f"Il nome «{name}» è già preso su Fly. Rilancia lo script e scegline un altro.")
            sys.exit(f"Non riesco a creare l'app:\n{msg.strip()}")
        print(f"Creata l'app {name}.")
    toml = FLY_TOML.read_text(encoding="utf-8")
    FLY_TOML.write_text(re.sub(r'(?m)^app = ".*"', f'app = "{name}"', toml, count=1), encoding="utf-8")

    title("4/6 Segreti")
    secret_names = ["DATABASE_URL", "SECRET_KEY", "ADMIN_KEY", "PULSE_DATA_KEY", "PULSE_CONTROLLER_NAME", "PULSE_CONTACT_EMAIL"]
    fly("secrets", "import", "--stage", "-a", name, stdin="".join(f"{k}={keys[k]}\n" for k in secret_names))
    print("Segreti consegnati a Fly (non compaiono nella cronologia di PowerShell).")

    title("5/6 Archivio foto (Tigris)")
    listed = fly("secrets", "list", "-a", name, "--json", capture=True, check=False)
    try:
        have = {s.get("Name") or s.get("name") for s in json.loads(listed.stdout or "[]")}
    except json.JSONDecodeError:
        have = set()
    if "BUCKET_NAME" in have:
        print("Archivio foto già collegato.")
    else:
        print("Ora Fly crea l'archivio delle foto. Se ti fa domande, premi Invio per accettare le risposte proposte.")
        fly("storage", "create", "-a", name, "-n", f"{name}-foto")

    title("6/6 Pubblicazione")
    print("Fly costruisce l'app sui suoi server: la prima volta ci vogliono alcuni minuti.")
    fly("deploy", "-a", name, "--ha=false")

    site = f"https://{name}.fly.dev"
    print("\nControllo che risponda…")
    for _ in range(20):
        try:
            with urllib.request.urlopen(f"{site}/api/health", timeout=15) as r:
                if r.status == 200:
                    print(f"\n✅ Pulse è online: {site}")
                    break
        except Exception:
            time.sleep(6)
    else:
        print(f"\nL'app non risponde ancora. Prova ad aprire {site} tra un minuto; se non va, lancia:  fly logs -a {name}")

    print(f"""
Prossimi passi:
  1. Apri {site} e registrati con il tuo nome utente (es. mario.rossi).
  2. Diventa amministratore: entra nel server con
       fly ssh console -a {name}
     poi scrivi  python -m app.admin_cli TUO_NOME_UTENTE  e infine  exit
  3. Copia {KEYS} nel tuo password manager.
Per pubblicare un aggiornamento in futuro:  cd $env:USERPROFILE\\pulse ; fly deploy --ha=false
""")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nInterrotto. Puoi rilanciare lo script quando vuoi: riprende da dove eri.")

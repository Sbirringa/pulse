#!/usr/bin/env python3
"""Pannello di moderazione da terminale.

    # in locale (il server deve essere avviato con la stessa ADMIN_KEY):
    $env:ADMIN_KEY="una-chiave-segreta"; python tools/moderate.py
    # in produzione:
    $env:PULSE_URL="https://tua-app.fly.dev"; $env:ADMIN_KEY="..."; python tools/moderate.py

Menu:
  1) Proposte di questioni in attesa  → approva / rifiuta
  2) Post, commenti e profili segnalati → vedi le foto, ripristina, rimuovi, resetta il profilo, banna
  3) Banna / riammetti un utente
"""
import json
import os
import sys
import tempfile
import urllib.error
import urllib.request
import webbrowser
from pathlib import Path

BASE = os.environ.get("PULSE_URL", "http://127.0.0.1:8000").rstrip("/")
KEY = os.environ.get("ADMIN_KEY", "")
REASONS = {"spam": "spam", "odio": "odio/insulti", "illegale": "illegale", "privacy": "privacy",
           "identita": "si spaccia per un altro", "falso": "falso", "altro": "altro"}


def request(method: str, path: str, body: dict | None = None, raw: bool = False):
    data = json.dumps(body).encode() if body is not None else None
    headers = {"X-Admin-Key": KEY}
    if data:
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(f"{BASE}{path}", data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            content = r.read()
            return content if raw else json.loads(content.decode() or "null")
    except urllib.error.HTTPError as e:
        detail = e.read().decode()[:300]
        print(f"  ! Errore {e.code}: {detail}")
        return None
    except urllib.error.URLError as e:
        sys.exit(f"Non riesco a raggiungere {BASE}: {e.reason}. Il server è avviato?")


def ask(prompt: str, allowed: str) -> str:
    while True:
        choice = input(prompt).strip().lower()
        if choice in allowed:
            return choice
        print(f"  Scegli una di queste lettere: {', '.join(allowed)}")


def open_photo(image_id: str, variant: str = "lg") -> None:
    data = request("GET", f"/api/admin/media/{image_id}/{variant}", raw=True)
    if not data:
        return
    path = Path(tempfile.gettempdir()) / f"pulse-moderazione-{image_id}.webp"
    path.write_bytes(data)
    print(f"  Apro la foto: {path}")
    if os.name == "nt":
        os.startfile(path)  # type: ignore[attr-defined]  # visualizzatore predefinito di Windows
    else:
        webbrowser.open(path.as_uri())


def proposals() -> None:
    pending = request("GET", "/api/admin/pending") or []
    if not pending:
        print("\nNessuna proposta in attesa.")
        return
    for p in pending:
        where = "Italia" if p["scope"] == "national" else p["city"]
        print(f"\n#{p['id']} [{p['category']} · {where}]\n  {p['title']}\n  {p['description']}")
        choice = ask("  [a]pprova / [r]ifiuta / [s]alta / [q] menu > ", "arsq")
        if choice == "q":
            return
        if choice in "ar":
            action = "approve" if choice == "a" else "reject"
            if request("POST", f"/api/admin/questions/{p['id']}/{action}"):
                print("  → pubblicata" if choice == "a" else "  → rifiutata")


def reports() -> None:
    items = request("GET", "/api/admin/reports") or []
    if not items:
        print("\nNessuna segnalazione aperta.")
        return
    print(f"\n{len(items)} contenuti da controllare (i più segnalati per primi).")
    for it in items:
        if it["type"] == "user":
            if review_profile(it) == "q":
                return
            continue
        kind = "POST" if it["type"] == "post" else "COMMENTO"
        reasons = ", ".join(f"{REASONS.get(k, k)} ×{v}" for k, v in it["reasons"].items()) or "nessuna (nascosto)"
        state = "NASCOSTO" if it["status"] == "hidden" else it["status"]
        author = it["author"] or "(account eliminato)"
        if it["author_banned"]:
            author += " [già bannato]"
        print("\n" + "─" * 60)
        print(f"{kind} #{it['id']} (post #{it['post_id']}) · stato: {state} · segnalazioni: {it['reports']}")
        print(f"Motivi: {reasons}")
        print(f"Autore: @{author}")
        print(f"Testo: {it['body'] or '(nessun testo)'}")
        if it["images"]:
            print(f"Foto: {len(it['images'])}")
        while True:
            options = "[v]edi foto / " if it["images"] else ""
            choice = ask(f"  {options}[o]k, ripristina / [r]imuovi / [b]anna autore e rimuovi tutto / [s]alta / [q] menu > ",
                         "vorbsq" if it["images"] else "orbsq")
            if choice == "v":
                for image_id in it["images"]:
                    open_photo(image_id)
                continue
            break
        if choice == "q":
            return
        if choice == "o":
            if request("POST", f"/api/admin/content/{it['type']}/{it['id']}/restore"):
                print("  → ripristinato, segnalazioni chiuse")
        elif choice == "r":
            if request("POST", f"/api/admin/content/{it['type']}/{it['id']}/remove"):
                print("  → rimosso (foto comprese)")
        elif choice == "b":
            if not it["author"]:
                print("  L'autore ha già eliminato l'account: rimuovo solo il contenuto.")
                request("POST", f"/api/admin/content/{it['type']}/{it['id']}/remove")
            elif ask(f"  Confermi il ban di @{it['author']} e la rimozione di TUTTI i suoi contenuti? [s/n] > ", "sn") == "s":
                if request("POST", "/api/admin/users/ban", {"nickname": it["author"], "purge": True}):
                    print("  → utente bannato, contenuti rimossi")


def review_profile(it: dict) -> str:
    reasons = ", ".join(f"{REASONS.get(k, k)} ×{v}" for k, v in it["reasons"].items())
    print("\n" + "─" * 60)
    print(f"PROFILO @{it['author']} · stato: {it['status']} · segnalazioni: {it['reports']}")
    print(f"Motivi: {reasons}")
    print(it["body"])
    allowed = "vorbsq" if it["images"] else "orbsq"
    while True:
        options = "[v]edi foto profilo / " if it["images"] else ""
        choice = ask(f"  {options}[o]k / [r]esetta nome, bio e foto / [b]anna e rimuovi tutto / [s]alta / [q] menu > ", allowed)
        if choice == "v":
            open_photo(it["images"][0], "av")
            continue
        break
    if choice == "o":
        if request("POST", f"/api/admin/users/{it['author']}/profile/restore"):
            print("  → profilo ok, segnalazioni chiuse")
    elif choice == "r":
        if request("POST", f"/api/admin/users/{it['author']}/profile/reset"):
            print("  → nome, bio e foto profilo cancellati")
    elif choice == "b":
        if ask(f"  Confermi il ban di @{it['author']} e la rimozione di TUTTI i suoi contenuti? [s/n] > ", "sn") == "s":
            if request("POST", "/api/admin/users/ban", {"nickname": it["author"], "purge": True}):
                print("  → utente bannato, contenuti rimossi")
    return choice


def ban_menu() -> None:
    nick = input("\nNickname: ").strip().lstrip("@")
    if not nick:
        return
    choice = ask("  [b]anna (i contenuti restano) / [t]banna e rimuovi tutto / [r]iammetti / [q] menu > ", "btrq")
    if choice == "b":
        r = request("POST", "/api/admin/users/ban", {"nickname": nick, "purge": False})
    elif choice == "t":
        r = request("POST", "/api/admin/users/ban", {"nickname": nick, "purge": True})
    elif choice == "r":
        r = request("POST", "/api/admin/users/unban", {"nickname": nick})
    else:
        return
    if r:
        print(f"  → @{r['nickname']}: {'bannato' if r['banned'] else 'riammesso'}")


def main() -> None:
    if not KEY:
        sys.exit("Imposta ADMIN_KEY (la stessa configurata sul server). Esempio PowerShell:\n"
                 '  $env:ADMIN_KEY="la-tua-chiave"; python tools/moderate.py')
    print(f"Moderazione di {BASE}")
    while True:
        print("\n1) Proposte in attesa   2) Segnalazioni   3) Banna/riammetti utente   q) Esci")
        choice = ask("> ", "123q")
        if choice == "q":
            return
        {"1": proposals, "2": reports, "3": ban_menu}[choice]()


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print()

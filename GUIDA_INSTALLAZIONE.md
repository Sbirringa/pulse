# PULSE — Guida passo passo (Windows)

Questa guida ti porta da zero a PULSE funzionante sul tuo PC. Non serve installare nessun database:
in locale PULSE usa un file (SQLite) e salva le foto in una cartella. Tempo: circa 15 minuti la prima volta.

Fai un passo alla volta. Se qualcosa non va, **copia tutto il testo rosso/di errore** e mandamelo.

---

## Passo 1 — Controlla Python

1. Premi il tasto **Windows**, scrivi `PowerShell` e apri **Windows PowerShell**.
2. Scrivi questo comando e premi **Invio**:

   ```powershell
   python --version
   ```

3. Cosa deve succedere: compare qualcosa come `Python 3.11.9` (va bene qualsiasi versione **3.11 o più recente**).

   - Se si apre il **Microsoft Store** oppure compare *"python non è riconosciuto"*: vai su https://www.python.org/downloads/,
     scarica Python, avvia l'installer e **spunta la casella "Add python.exe to PATH"** in basso prima di cliccare
     *Install Now*. Poi **chiudi e riapri** PowerShell e riprova il comando.

## Passo 2 — Installa Node.js (serve per costruire l'interfaccia)

1. Vai su https://nodejs.org e scarica la versione **LTS** (il pulsante a sinistra, "consigliata").
2. Apri il file `.msi` scaricato e clicca **Next** fino alla fine lasciando tutte le opzioni come sono.
   (Se a un certo punto ti propone *"Tools for Native Modules"*, puoi lasciare la casella **non** spuntata.)
3. **Chiudi PowerShell e riaprilo** (altrimenti non "vede" Node appena installato).
4. Controlla:

   ```powershell
   node --version
   npm --version
   ```

   Devono comparire due numeri di versione (es. `v22.x.x` e `10.x.x`).

## Passo 3 — Estrai il progetto

1. Scarica `pulse.zip` (il file che ti ho mandato).
2. Tasto destro sul file → **Estrai tutto…** → come destinazione scegli il **Desktop** → **Estrai**.
3. Sul Desktop ora c'è la cartella `pulse`. Aprila: dentro devi vedere `run_local.py`, `README.md` e le cartelle
   `backend` e `frontend`.
   - Se invece dentro c'è un'altra cartella `pulse`, il progetto è quella interna: usa quella nei passi successivi.

## Passo 4 — Apri PowerShell nella cartella del progetto

Il modo più semplice:

1. Apri la cartella `pulse` in Esplora file (quella che contiene `run_local.py`).
2. Clicca sulla **barra dell'indirizzo** in alto (dove c'è scritto il percorso), cancella, scrivi `powershell` e premi **Invio**.
3. Si apre PowerShell già nella cartella giusta. Verifica con:

   ```powershell
   dir run_local.py
   ```

   Se vedi il file elencato, sei nel posto giusto.

## Passo 5 — Avvia PULSE

```powershell
python run_local.py
```

La **prima volta** ci mette qualche minuto (2-5, dipende dalla connessione) perché:

1. crea un ambiente Python dedicato (`backend\.venv`) e ci installa le librerie (FastAPI, Pillow per le foto, ecc.);
2. installa le librerie dell'interfaccia (`frontend\node_modules`);
3. costruisce l'interfaccia;
4. crea il database con le domande iniziali.

Vedrai scorrere molte righe: è normale. Hai finito quando compare:

```
>> PULSE è pronta → apri http://127.0.0.1:8000  (Ctrl+C per fermare)
```

**Lascia aperta questa finestra**: finché è aperta, PULSE è accesa.

## Passo 6 — Usala

1. Apri il browser e vai su **http://127.0.0.1:8000**: si apre **Pulse** (la home), visibile anche senza account.
2. Tocca **Registrati** in alto e crea un account (nome utente, password, città facoltativa, spunta il consenso).
3. **Salva il codice di recupero** che ti mostra (in questa fase di prova puoi anche copiarlo in un file di testo).
4. Nella schermata **"Fatti riconoscere"** aggiungi foto e nome (oppure "Lo faccio dopo").
5. Prova:
   - **Pulse**: tocca il **+** in basso → "Nuovo post" → aggiungi fino a 4 foto → Pubblica; usa i filtri Tutti / Seguiti /
     città per esplorare;
   - **Sondaggi**: trascina le card (destra = favorevole, sinistra = contrario, su = dipende) o usa i pulsanti;
     apri un post → commenta, allega una foto con l'icona a sinistra della casella, rispondi a un commento;
     nei commenti la foto compare come l'icona **"Foto"**: toccala per aprirla, chiudila con la **X**;
   - **Profilo**: foto, nome, bio, follower/seguiti, le richieste di chi vuole seguirti; dentro trovi anche **Pulse**
     (statistiche e card da condividere) e **Impostazioni** (città, esci, elimina account);
   - **Seguire qualcuno**: tocca il nome di una persona → "Segui" → lei vede il pallino rosso su Attività
     e accetta. Oppure cerca il nome utente esatto con la lente in alto.

**Per provare con due persone sul tuo PC**: apri una finestra in incognito (`Ctrl + Shift + N` in Chrome/Edge),
vai sullo stesso indirizzo e crea un secondo account. Così puoi rispondere ai tuoi stessi post e provare le richieste di follow.

**Per provarla dal telefono** (stessa rete Wi-Fi): vedi la sezione *"Dal telefono"* in fondo.

## Passo 7 — Fermarla e riavviarla

- **Fermare**: nella finestra di PowerShell premi `Ctrl + C`.
- **Riavviare**: apri PowerShell nella cartella (Passo 4) e rilancia `python run_local.py`. Dalla seconda volta parte
  in pochi secondi. I tuoi account, post e foto restano (sono in `backend\data`).
- **Ricominciare da zero** (cancella tutti i dati di prova): con PULSE fermata, elimina la cartella `backend\data`.
  Dentro c'è anche `.datakey`, la chiave che cifra i dati di prova: se la cancelli da sola senza cancellare il resto,
  i dati di prova non sono più leggibili.

---

## Extra (facoltativi)

### Diventare amministratore (moderazione dall'app)

1. Registrati nell'app con il tuo nome utente (es. `mario.rossi`).
2. Apri **una seconda** finestra PowerShell (PULSE può restare accesa nella prima) e scrivi:

   ```powershell
   cd $HOME\pulse
   backend\.venv\Scripts\python tools\make_admin.py mario.rossi
   ```

3. Ricarica la pagina: in **Profilo** compare la scheda **Moderazione**. Lì trovi solo i contenuti segnalati
   (quelli con 3 segnalazioni sono già nascosti in automatico) e decidi con un tocco: Ripristina, Elimina, Banna.

### Pannello di moderazione da terminale (facoltativo)

Serve una chiave admin. Nella finestra dove avvii PULSE:

```powershell
$env:ADMIN_KEY="scegli-una-chiave-lunga"
python run_local.py
```

Poi apri **una seconda** finestra PowerShell nella stessa cartella e scrivi:

```powershell
$env:ADMIN_KEY="scegli-una-chiave-lunga"
python tools\moderate.py
```

Dal menu puoi approvare le proposte, controllare i contenuti segnalati (anche aprendo le foto), rimuoverli e bannare utenti.

### Eseguire i test automatici

```powershell
backend\.venv\Scripts\python -m pip install -r backend\requirements-dev.txt
cd backend
.venv\Scripts\python -m pytest
cd ..
```

Devono passare tutti (57 test).

### Dal telefono (stessa rete Wi-Fi)

1. Scopri l'indirizzo del PC: in PowerShell scrivi `ipconfig` e cerca **Indirizzo IPv4** (es. `192.168.1.23`).
2. Avvia PULSE accessibile in rete: ferma quella in corso (`Ctrl + C`) e lancia
   `backend\.venv\Scripts\python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --app-dir backend`
3. Se Windows chiede il permesso del firewall, consenti per le **reti private**.
4. Sul telefono apri `http://192.168.1.23:8000` (con il tuo indirizzo).

Nota: il login funziona anche così perché in locale il cookie non richiede HTTPS. In produzione serve HTTPS (Fly.io lo dà già).

---

## Problemi comuni

| Messaggio | Cosa fare |
| --- | --- |
| `python non è riconosciuto…` | Reinstalla Python spuntando **"Add python.exe to PATH"** (Passo 1), poi riapri PowerShell |
| `Manca 'npm'` | Installa Node.js (Passo 2) e **riapri** PowerShell |
| `error while attempting to bind on address` (porta occupata) | Hai già PULSE aperta in un'altra finestra, oppure usa `python run_local.py --port 8001` e apri http://127.0.0.1:8001 |
| `can't open file … run_local.py` | Non sei nella cartella giusta: rifai il Passo 4 |
| Errori durante `pip install` o `npm install` | Controlla la connessione; se sei su una rete aziendale con proxy, prova da casa |
| La pagina dice "Il frontend non è stato compilato" | Rilancia `python run_local.py` (senza `--skip-build`) e guarda se ci sono errori |
| Foto rifiutata ("Formato non supportato") | Sono accettate JPG, PNG e WebP. Le foto HEIC dell'iPhone di solito vengono convertite in automatico dal browser; se non succede, esportale come JPG |

---

## Più avanti: metterla online

Quando la versione locale ti convince, la pubblicazione richiede: un database **Neon** (gratuito), un'app **Fly.io**
(non più gratuita: circa 2-4 $/mese) e lo storage foto **Tigris** (5 GB gratuiti). I comandi sono nel `README.md`,
sezione *"Pubblicarla"*. Lì ti guido io passo passo quando ci arriviamo, compresi titolare e contatto per l'informativa
privacy (obbligatori per andare online).

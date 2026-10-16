# PULSE

**Discuti. Vota. Partecipa.**

PULSE è un'app civica open source: le persone raccontano cosa succede dove vivono, fanno proposte e votano
sondaggi sulla loro città o su tutta Italia. È pensata per la partecipazione, non per il rumore: niente
algoritmi di engagement, voti segreti e dati personali cifrati.

**Online:** [people-pulse.fly.dev](https://people-pulse.fly.dev)

---

## Funzionalità

- **Pulse** — il feed con post e sondaggi di tutta Italia, delle persone che segui o di una città qualsiasi.
- **Post** con fino a 4 foto, commenti a thread e risposte con foto.
- **Proposte** — un'idea per la città raccoglie sostenitori («Sostengo»); raggiunto il traguardo diventa da sola un
  sondaggio aperto a tutti.
- **Sondaggi** creati dalle persone, con foto e scadenza. Si vota con un tocco (*Favorevole · Dipende · Contrario*);
  le percentuali compaiono solo dopo il voto, per non influenzarlo.
- **Le ragioni** — sotto ogni sondaggio, «Perché sì» e «Perché no» affiancati. Le ragioni più utili salgono in cima,
  senza nome: si discute sugli argomenti, non sulle persone.
- **Domanda del giorno** — in cima al feed, un sondaggio a cui non hai ancora risposto, prima della tua città.
- **Città** — tutti i 7.896 comuni italiani. Nei sondaggi di una città si vedono separati i voti di chi è *di qui* e
  di chi vota *da fuori*; chi crea un contenuto può riservarlo alle persone di quella città.
- **Mappa** — dove si parla adesso, una bolla per comune.
- **Profili** pubblici o privati, follow con richieste da approvare, *persone coinvolte* al posto delle metriche di
  vanità.
- **Attività** — notifiche per follower, commenti, risposte, sondaggi conclusi e proposte diventate sondaggio.
- **Moderazione** — segnalazioni con nascondimento automatico e pannello di moderazione nell'app.
- **Ospiti** — chi non è registrato legge tutto; gli si chiede di entrare solo quando vuole partecipare.

## Privacy e sicurezza

| Area | Come è fatto |
|---|---|
| Account | solo nome utente e password (Argon2id), con codice di recupero. Niente email, telefono o GPS |
| Dati personali | nomi, bio, città, testi e foto sono cifrati (AES-GCM) nel database e nello storage |
| Voti | segreti: il voto non contiene l'id dell'utente ma un'impronta HMAC; scelta e città sono cifrate. Le percentuali compaiono solo sopra una soglia minima di voti |
| Ragioni e sostegni | mostrati senza nome, solo come numeri |
| Foto | ricodificate in WebP senza metadati (niente posizione); l'originale non viene mai salvato; storage privato |
| Ricerca | su impronte HMAC dei prefissi: i nomi restano cifrati anche per cercare |
| Web | cookie di sessione httpOnly/SameSite/Secure, CSP rigida, nessuno script o font esterno, nessun tracciamento |
| GDPR | consenso registrato con versione dell'informativa, eliminazione dell'account in autonomia |

La cifratura protegge da chi accede a database, backup o storage. Il server deve comunque decifrare i contenuti per
mostrarli agli utenti: per un social pubblico non è possibile una cifratura end-to-end. I dettagli sono nelle pagine
*Sicurezza* e *Privacy* dell'app.

## Tecnologie

- **Backend:** Python 3.11+, FastAPI, SQLAlchemy 2, Alembic, PostgreSQL (SQLite in locale)
- **Frontend:** React 19, TypeScript, Tailwind CSS 4, Vite, MapLibre GL
- **Infrastruttura di riferimento:** Fly.io (app), Neon (PostgreSQL), Tigris (foto, compatibile S3)

Un solo servizio: FastAPI serve sia le API sia il frontend compilato.

## Avvio in locale

Servono **Python 3.11+** e **Node.js LTS**. Nessun database da installare: in locale si usa SQLite.

```bash
git clone https://github.com/Sbirringa/pulse.git
cd pulse
python run_local.py
```

Apri <http://127.0.0.1:8000>. Al primo avvio lo script crea l'ambiente virtuale, installa le dipendenze, compila il
frontend e avvia il server. Database e chiavi locali vengono creati in `backend/data/` (escluso da Git).

- Sviluppo con hot reload: `python run_local.py --dev` → <http://127.0.0.1:5173>
- Impostazioni personali: copia `pulse.env.example` come `pulse.env` (escluso da Git) e compilalo.

## Configurazione

In produzione l'app non parte se mancano le variabili obbligatorie.

| Variabile | Obbligatoria | Descrizione |
|---|---|---|
| `DATABASE_URL` | in produzione | connection string PostgreSQL (senza: SQLite locale) |
| `SECRET_KEY` | in produzione | firma delle sessioni; non cambiarla dopo il lancio |
| `PULSE_DATA_KEY` | in produzione | chiave di cifratura dei dati. **Conservane una copia sicura: se si perde, i dati cifrati non sono più leggibili** |
| `PULSE_CONTROLLER_NAME` | in produzione | titolare del trattamento mostrato nell'informativa |
| `PULSE_CONTACT_EMAIL` | in produzione | contatto per privacy e segnalazioni |
| `BUCKET_NAME`, `AWS_*` | in produzione | storage S3 per le foto |
| `ADMIN_KEY` | no | chiave per le API di amministrazione da terminale |
| `PULSE_SOURCE_URL` | no | link al codice sorgente (pulsante *Open source*) |
| `PULSE_MIN_RESULTS` / `PULSE_MIN_CITY_RESULTS` | no (5 / 5) | voti minimi per mostrare le percentuali / il dato per città |
| `PULSE_PROPOSAL_GOAL` | no (20) | sostenitori necessari perché una proposta diventi sondaggio |
| `PULSE_REPORT_HIDE_THRESHOLD` | no (3) | segnalazioni dopo cui un contenuto si nasconde |
| `PULSE_POSTS_PER_DAY` | no (5) | post per utente ogni 24 ore |
| `PULSE_MAX_UPLOAD_MB` | no (10) | dimensione massima di una foto |
| `PULSE_MIN_AGE` | no (14) | età minima dichiarata alla registrazione |
| `PULSE_REGISTER_PER_IP_HOUR` / `PULSE_REGISTER_GLOBAL_HOUR` | no (60 / 1000) | limiti alle registrazioni |

## Pubblicazione

Il repository include `Dockerfile` e `fly.toml`. Con [flyctl](https://fly.io/docs/flyctl/) installato e un database
PostgreSQL pronto (ad esempio su Neon, in una regione europea):

```bash
python tools/pubblica_fly.py
```

Lo script crea le chiavi (salvate fuori dalla cartella del progetto), crea l'app, imposta i segreti, crea lo storage
per le foto e pubblica. In alternativa, a mano:

```bash
fly apps create NOME-APP
fly secrets set DATABASE_URL=... SECRET_KEY=... PULSE_DATA_KEY=... PULSE_CONTROLLER_NAME=... PULSE_CONTACT_EMAIL=...
fly storage create
fly deploy --ha=false
```

Le migrazioni del database si applicano da sole all'avvio. Controllo: `https://NOME-APP.fly.dev/api/health`.

## Amministrazione

- **Nominare un amministratore** (dopo la registrazione nell'app):
  in locale `backend/.venv/bin/python tools/make_admin.py NOME_UTENTE` (Windows: `backend\.venv\Scripts\python`); su Fly entra con `fly ssh console` e lancia
  `python -m app.admin_cli NOME_UTENTE`. Nel profilo compare la scheda **Moderazione**.
- **Moderazione:** post, commenti, sondaggi, ragioni e profili si segnalano dall'app; dopo 3 segnalazioni il contenuto
  si nasconde e arriva in Moderazione (ripristina, elimina, azzera il profilo, banna).
- **Ripulire un utente:** `backend/.venv/bin/python tools/pulisci.py NOME_UTENTE` (su Fly: `python -m app.cleanup_cli NOME_UTENTE`).

## Sviluppo

```
pulse/
├── backend/
│   ├── app/          API FastAPI, modelli, cifratura, moderazione
│   ├── migrations/   migrazioni Alembic (applicate all'avvio)
│   └── tests/        test automatici (SQLite e PostgreSQL)
├── frontend/src/     interfaccia React
├── tools/            script di amministrazione e pubblicazione
├── Dockerfile · fly.toml
└── run_local.py      avvio locale con un comando
```

**Test:**

```bash
cd backend
.venv/bin/python -m pip install -r requirements-dev.txt      # Windows: .venv\Scripts\python
.venv/bin/python -m pytest
# su PostgreSQL, con un database vuoto e usa-e-getta:
PULSE_TEST_DATABASE_URL=postgresql://... .venv/bin/python -m pytest
```

**Nuova migrazione** dopo aver modificato `app/models.py`:
`alembic revision --autogenerate -m "descrizione"` (dalla cartella `backend`), poi rileggi il file generato.
Il test `test_schema_matches_models` segnala le migrazioni dimenticate.

## Limiti noti

- Non c'è verifica dell'identità: un account non equivale a una persona. I risultati sono *degli utenti di PULSE*,
  non sondaggi rappresentativi, e l'app lo dichiara.
- I limiti di frequenza sono in memoria: valgono con una sola istanza. Per più istanze serve uno store condiviso
  (es. Redis).
- Le foto non hanno un filtro automatico dei contenuti: la moderazione si basa sulle segnalazioni.

## Contribuire

Segnalazioni e proposte di modifica sono benvenute: apri una *issue* o una *pull request*. Per le vulnerabilità di
sicurezza segui [SECURITY.md](SECURITY.md).

## Licenza

PULSE è software libero, rilasciato sotto **GNU Affero General Public License v3.0** (vedi [LICENSE](LICENSE)).
Puoi usare, studiare, modificare e ridistribuire il codice. Se lo usi per offrire un servizio online, anche
modificato, devi rendere disponibile il codice sorgente delle tue modifiche agli utenti di quel servizio.

I confini e l'elenco dei comuni derivano da dati ISTAT (CC-BY 4.0); le mappe usano OpenFreeMap e dati
© OpenStreetMap contributors.

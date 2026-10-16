# PULSE — il battito della tua città

Il battito della tua città: si racconta cosa succede dove si vive, si discute, si propone. Chi non è registrato vede subito
tutto (post, commenti, foto, profili, città) e gli si chiede di registrarsi solo quando vuole partecipare.
Schede: **Pulse** (home: post e sondaggi insieme) · **Sondaggi** (si scorrono con il dito, percentuali dopo il voto) · **+** (nuovo post / nuovo
sondaggio) · **Attività** (notifiche) · **Profilo** (post, sondaggi, polso e impostazioni). Il feed **Pulse**: post con fino a 4 foto,
commenti a thread ordinati (anche con foto, mostrate come icona che apre il visualizzatore), segnalazioni e moderazione.
**Profili**: nome e cognome (facoltativi), bio, foto profilo, segui/smetti di seguire con richieste da approvare,
contatori follower/seguiti, feed "Seguiti". **Cifratura**: nomi, testi e foto sono illeggibili nel database e nello storage. Account anonimi: **solo nickname + password**,
con codice di recupero (niente email, telefono, GPS).

Costo licenze: **zero** (tutto open source). Un solo servizio da pubblicare: FastAPI serve API e frontend insieme.

```
pulse/
├── backend/
│   ├── app/          FastAPI + SQLAlchemy (SQLite in locale, PostgreSQL/Neon in produzione)
│   ├── migrations/   migrazioni dello schema (Alembic), applicate da sole all'avvio
│   ├── app/data/comuni.json  7.896 comuni italiani con coordinate (ISTAT, CC-BY 4.0)
│   └── tests/        57 test (SQLite e PostgreSQL)
├── frontend/         React + TypeScript + Tailwind (swipe con gesto, card PNG, PWA-ready)
├── tools/make_admin.py  rende amministratore un utente (moderazione dall'app)
├── tools/moderate.py pannello di moderazione da terminale (facoltativo)
├── tools/build_comuni.py rigenera l'elenco dei comuni dai confini ISTAT
├── GUIDA_INSTALLAZIONE.md  passo passo per Windows
├── run_local.py      avvio locale con un comando
├── Dockerfile · fly.toml
```

## 1) Provarla in locale (Windows / PowerShell)

> Prima volta? Segui **GUIDA_INSTALLAZIONE.md**: spiega ogni passaggio, da come installare Node.js in poi.

Servono solo **Python 3.11+** e **Node.js LTS**. Nessun database da installare: in locale usa SQLite.

```powershell
cd pulse
python run_local.py
```

Apri http://127.0.0.1:8000. Al primo avvio crea il venv, installa le dipendenze, compila il frontend e parte.
Le 26 domande nazionali + 5 domande locali per ognuna delle 47 città si caricano da sole.

- Sviluppo con hot reload: `python run_local.py --dev` → http://127.0.0.1:5173
- Test backend: `backend\.venv\Scripts\python -m pip install -r backend\requirements-dev.txt` (una volta), poi
  `cd backend; .venv\Scripts\python -m pytest`
- Per vedere subito il confronto "in sintonia con gli altri" anche con pochi utenti, abbassa le soglie:
  `$env:PULSE_MIN_RESULTS="1"; $env:PULSE_MIN_CITY_RESULTS="1"; python run_local.py`
  (in produzione lasciale a 5: proteggono i piccoli gruppi e non fanno sembrare "reale" un dato di 2 persone)
- Provare **Neon** già in locale: `$env:DATABASE_URL="postgresql://utente:pass@host/db?sslmode=require"; python run_local.py`

## 2) Pubblicarla: Neon + Fly.io

> **Costi (verificati a ottobre 2026)**: Fly.io non ha più un piano gratuito per i nuovi account (prova di 7 giorni, poi
> carta di credito; circa 2,19 $/mese con 256 MB, 3,69 $/mese con 512 MB se la macchina resta sempre accesa).
> Neon ha un piano gratuito. Tigris (foto) offre 5 GB gratuiti al mese, traffico in uscita gratuito, senza carta.

1. **Neon** (nuovo progetto, regione EU): copia la connection string. Tabelle e domande si creano da sole al primo avvio.
2. **Fly.io**: crea l'account, installa `flyctl`, poi dalla cartella `pulse`:

```powershell
fly auth login
fly launch --no-deploy --copy-config --name NOME-LIBERO --region cdg
fly secrets set `
  DATABASE_URL="postgresql://...neon.tech/neondb?sslmode=require" `
  SECRET_KEY="$(python -c 'import secrets;print(secrets.token_urlsafe(48))')" `
  ADMIN_KEY="$(python -c 'import secrets;print(secrets.token_urlsafe(32))')" `
  PULSE_DATA_KEY="$(python -c 'import secrets;print(secrets.token_urlsafe(32))')" `
  PULSE_CONTROLLER_NAME="Nome Cognome" `
  PULSE_CONTACT_EMAIL="privacy@tuodominio.it"
fly storage create      # crea il bucket Tigris per le foto e imposta da solo i suoi secret
fly deploy
```

`fly storage create` stampa `BUCKET_NAME`, `AWS_ENDPOINT_URL_S3`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`: se non li
imposta da solo sull'app, copiali con `fly secrets set NOME=valore`. Senza storage S3 l'app **non parte** in produzione:
sul disco della macchina le foto sparirebbero a ogni deploy.

Controlla `https://NOME-LIBERO.fly.dev/api/health` → `{"status":"ok"}`.

**In locale**: copia `pulse.env.example` come `pulse.env` e scrivi titolare, email e (quando c'è) il link GitHub:
`run_local.py` lo legge da solo. `pulse.env` non viene sovrascritto dagli aggiornamenti e resta fuori da Git.

In produzione l'app **non parte** se mancano `SECRET_KEY`, `PULSE_DATA_KEY`, `PULSE_CONTROLLER_NAME` o `PULSE_CONTACT_EMAIL`:
meglio un errore al deploy che un'app pubblica incompleta. Non cambiare `SECRET_KEY` dopo il lancio: invaliderebbe le sessioni.

> ⚠️ **`PULSE_DATA_KEY` è la chiave che cifra nomi, testi e foto.** Salvane una copia in un posto sicuro (password manager)
> **prima** del primo deploy: se la perdi o la cambi, quei dati diventano illeggibili per sempre, anche per te.
> In locale viene creata da sola in `backend/data/.datakey` (non pubblicarla e non cancellarla se vuoi tenere i dati di prova).

**Diventare amministratore in produzione** (dopo esserti registrato nell'app con il tuo nome utente):
`fly ssh console -C "python -m app.admin_cli tuo_nome_utente"`. Da quel momento in Profilo trovi la scheda **Moderazione**.

### Variabili opzionali

| Variabile | Default | A cosa serve |
| --- | --- | --- |
| `PULSE_REGISTER_PER_IP_HOUR` | 60 | registrazioni/ora dallo stesso IP (alzala per un evento dal vivo con tante persone sulla stessa rete) |
| `PULSE_REGISTER_GLOBAL_HOUR` | 1000 | tetto globale di registrazioni/ora (ferma un'ondata di bot) |
| `PULSE_HASH_CONCURRENCY` | 4 | hash Argon2 simultanei (~19 MB ciascuno): protegge la VM da 256 MB |
| `PULSE_MIN_RESULTS` / `PULSE_MIN_CITY_RESULTS` | 5 / 5 | soglie sotto cui i risultati sono provvisori / il dato per città è nascosto |
| `PULSE_MIN_AGE` | 14 | età minima dichiarata alla registrazione |
| `PULSE_MAX_UPLOAD_MB` | 10 | peso massimo di una foto |
| `PULSE_IMAGE_CONCURRENCY` | 1 | foto elaborate in parallelo (ognuna può usare ~50-100 MB di RAM) |
| `PULSE_POSTS_PER_DAY` | 5 | post per utente ogni 24 ore |
| `PULSE_REPORT_HIDE_THRESHOLD` | 3 | segnalazioni di utenti diversi dopo cui un contenuto viene nascosto |
| `PULSE_STORAGE` | auto | `local` o `s3` (automatico: `s3` se c'è `BUCKET_NAME`) |

## Moderazione: niente approvazioni a mano

- Post, commenti e **sondaggi proposti** si pubblicano **subito**. Un filtro automatico blocca i sondaggi con insulti e
  bestemmie evidenti (`backend/app/moderation.py`, parole modificabili).
- Chiunque può segnalare post, commenti, sondaggi e profili. Con **3 segnalazioni** di persone diverse (variabile
  `PULSE_REPORT_HIDE_THRESHOLD`) il contenuto si **nasconde da solo**.
- Tu, da **amministratore**, apri Profilo → **Moderazione**: vedi solo ciò che è stato segnalato e decidi con un tocco
  (Ripristina · Elimina · Cancella nome/bio/foto del profilo · Banna autore). Puoi anche eliminare qualsiasi post o commento
  dal menu "⋯ → Elimina (admin)".
- **Ripulire un utente** (dati di prova, spam): `backend\.venv\Scripts\python tools\pulisci.py` mostra tutti gli
  utenti con quanti post/commenti/sondaggi/voti hanno; `tools\pulisci.py gigi` mostra i suoi contenuti e chiede se
  cancellare **1)** post, commenti, sondaggi e voti (l'account resta) · **2)** solo i voti · **3)** l'account intero.
  Prima di cancellare chiede di riscrivere il nome utente. Dei voti si vede solo il numero, mai cosa ha votato.
  Su Fly: `fly ssh console -C "python -m app.cleanup_cli gigi"`.
- Diventare amministratore in locale: `backend\.venv\Scripts\python tools\make_admin.py tuo_nome_utente`
  (togliere: aggiungi `--rimuovi`).

## Sondaggi, notifiche, eliminazioni

- **Chi può partecipare** (post, proposte e sondaggi di una città): dopo **Dove → città** compare una sola domanda,
  **Tutti** oppure **Solo chi è di …**. Riservato: tutti leggono, ma commentano, sostengono e votano solo le persone
  di quella città; chi è di fuori vede l'etichetta "Solo chi è di …" e, nei sondaggi, direttamente i risultati.
  "Sei di …?" si chiede **una volta per città** (tabella `city_places`, nome cifrato) e vale per tutti i suoi
  contenuti; la città del profilo vale già. Si tolgono da Profilo → Impostazioni. Codice: `backend/app/local.py`.

- **Voti protetti** (`backend/app/votes.py`): nel database un voto **non contiene il codice dell'utente** ma
  un'impronta HMAC (`vote_owner`, con chiave segreta) e il voto, il "di qui / da fuori" e la città sono **cifrati**.
  Le percentuali si leggono da `vote_tallies` (solo numeri); il dettaglio "A Roma" si calcola al momento, così nel
  database non restano gruppi per città. Chi ruba il database non sa chi ha votato né cosa; chi ha server **e**
  chiave potrebbe ricostruirlo (limite di qualsiasi app con un voto a persona). I voti esistenti vengono convertiti
  dalla migrazione `0012`, che non si può annullare: **fai un backup del database prima di aggiornare online**.

- **Proposte e «Anch'io»** (dal post al voto): nel nuovo post si sceglie **Post** o **Proposta**.
  Sui post c'è **«Anch'io»** ("succede anche a me"), sulle proposte **«Sostengo»** con la barra "12 su 20 sostenitori".
  Raggiunto il traguardo (`PULSE_PROPOSAL_GOAL`, predefinito **20**) la proposta diventa **da sola un sondaggio**
  della stessa città (o nazionale), aperto 7 giorni; autore e sostenitori ricevono l'avviso in Attività.
  Si mostra solo il numero di chi ha sostenuto, mai i nomi. Chi sostiene conta tra le "persone coinvolte".
  Codice: `backend/app/social.py` (`support_post`, `_proposal_to_poll`). Per provare in locale con pochi utenti:
  `PULSE_PROPOSAL_GOAL=3` in `pulse.env`.

- **Le ragioni** (pro e contro sotto ogni sondaggio): due colonne **«Perché sì»** e **«Perché no»** con la ragione
  più utile di ciascun lato; **«Tutte le ragioni»** apre l'elenco con il pulsante **«Utile»** e il modulo per scrivere.
  Una ragione per lato a persona, 10–200 caratteri, niente link, **senza nome** (chi scrive non rivela come vota),
  testo **cifrato** nel database. Si segnalano come post e commenti (nascoste dopo 3 segnalazioni, poi Moderazione).
  Nei sondaggi riservati a una città scrivono solo le persone di lì; a sondaggio concluso non se ne aggiungono.
  Codice: `backend/app/debate.py`, `frontend/src/components/polls/Reasons.tsx`. Migrazione `0014`.

- **Domanda del giorno**: in cima al Pulse (Tutti) un sondaggio aperto a cui non hai ancora risposto, prima delle tue
  città (profilo e dichiarate), altrimenti nazionale; vince quello con più partecipanti. Non compare due volte nel feed.
  Endpoint `GET /api/polls/today`.

- **Menu ☰ in alto** (a sinistra del logo): **Ecosistema**, **Sicurezza**, **Open source**, **Termini**, **Privacy**
  (pagine `/ecosistema`, `/sicurezza`, `/open-source`, `/termini`, testi in `frontend/src/components/info/InfoPages.tsx`).
  Il pulsante "Vedi il codice su GitHub" usa la variabile **`PULSE_SOURCE_URL`** (es. `https://github.com/tuonome/pulse`):
  finché è vuota compare "Repository in arrivo". Su Fly: `fly secrets set PULSE_SOURCE_URL=https://github.com/...`.
  In locale (PowerShell): `$env:PULSE_SOURCE_URL="https://github.com/..."; python run_local.py`.
  Alla registrazione il consenso include i Termini; se li modifichi cambia `TERMS_VERSION` in `backend/app/config.py`.

- **Profilo pubblico o privato** (Modifica profilo → "Profilo privato"): con il profilo privato post e sondaggi li
  vede solo chi si segue **a vicenda** con te (nome, foto e bio restano visibili, le richieste si approvano sempre).
  Vale ovunque: feed, città, mappa, sondaggi, link condivisi, foto (`backend/app/privacy.py`). Agli altri compare
  "Questo profilo è privato".
- **Elenchi follower/seguiti**: li apre e li cerca (mentre scrivi) solo il proprietario, nel proprio profilo.
  Negli altri profili si vedono solo i numeri, anche se vi seguite.

- **Persone coinvolte** (nel profilo, oltre a follower e seguiti): quante persone **diverse** hanno risposto ai post o
  votato i sondaggi di qualcuno; ognuna conta una volta, i propri commenti/voti e gli account bannati non contano
  (`backend/app/reach.py`). Su ogni post e sondaggio la stessa unità: "N persone".
  Sotto, solo se ci sono entrambi, i due canali ("9 con i sondaggi · 5 con i post": non si sommano, chi fa entrambe
  le cose conta una volta) e **il contenuto più seguito** (da 2 persone in su), che si apre con un tocco. Niente medie
  né zeri: senza persone coinvolte compare un messaggio che spiega come iniziare.
- **"Fa discutere"**: sui sondaggi con almeno 10 voti, favorevoli e contrari a massimo 10 punti di distanza e insieme
  almeno il 60%. Non dice chi vince, quindi non influenza il voto.

- **Regole città**: i post (di tutta Italia o di una città) li commenta chiunque. I sondaggi di tutta Italia li vota
  chiunque. I sondaggi **di una città** li vota chiunque, ma chi non ha quella città nel profilo dichiara se è
  **"di qui"** o **"di fuori"**: nei risultati, oltre alle percentuali di tutti, si vedono
  **"Chi è di …"** e **"Da fuori"** separati (numero di voti sempre; percentuali solo sopra `PULSE_MIN_CITY_RESULTS`).
- **Voto segreto**: nessuno vede come ha votato un altro; le percentuali compaiono solo da `PULSE_MIN_RESULTS` voti (5).
- Nel feed, per Tutti / Seguiti / una città: **Tutto · Post · Sondaggi**.

- **Niente sondaggi "di PULSE"**: li creano solo le persone. Finché non ce n'è nessuno, l'app mostra **esempi visivi**
  (etichettati "Esempio", con disegni e numeri inventati) e, quando crei un sondaggio, **idee da toccare** e
  un'**anteprima dal vivo**. Gli aggiornamenti cancellano i vecchi sondaggi di esempio (migrazione 0007).
- **Swipe**: nella scheda Sondaggi si scorre con il dito da un sondaggio all'altro (il prossimo si intravede sul bordo);
  dentro un post, con i commenti, swipe a sinistra/destra per il post successivo/precedente.

- **Sondaggi creati dalle persone**: domanda, contesto facoltativo, **una foto** (cifrata come le altre) e una
  **scadenza** (1 giorno, 3 giorni, 1 settimana, 1 mese o nessuna). Compaiono anche **nel feed Pulse** e si votano
  con un tocco; dopo il voto si vedono le **percentuali** (il "polso" a tre colori). Alla scadenza il voto si chiude, i
  risultati diventano visibili a tutti e chi ha creato o votato riceve una notifica.
- **Notifiche** (scheda **Attività**, con il numero sulla campanella): nuovi follower, richieste di follow (si accettano
  lì), commenti ai tuoi post, risposte ai tuoi commenti, sondaggi conclusi. Nel database solo "chi, cosa, dove", nessun
  testo; si controllano ogni 45 secondi solo con l'app aperta.
- **Eliminare**: chi ha scritto un post o creato un sondaggio lo elimina dal menu **⋯** (con conferma). I commenti
  hanno "Elimina" sotto.

## Mappa e comuni (gratis)

- **Mappa di riserva interna**: se OpenFreeMap non risponde (rete, firewall, servizio giù) la mappa passa da sola a una
  mappa d'Italia inclusa nell'app (`frontend/public/italia.json`: regioni e province ISTAT, CC-BY, rigenerabile con
  `tools/build_italia.py`), con la scritta "Mappa semplificata". Se la mappa non si apre affatto, sotto compare il motivo.

- Mappe: **MapLibre** (open source) + **OpenFreeMap** stile *Dark*: gratuite, senza chiavi, senza limiti, uso commerciale
  consentito. L'attribuzione OpenStreetMap/OpenMapTiles è mostrata in automatico sulla mappa. Il codice della mappa si
  scarica solo quando una mappa viene aperta.
- Comuni: tutti i **7.896 comuni** con coordinate, cercati nel browser (nessun servizio esterno). "Usa la mia posizione"
  calcola il comune più vicino **nel telefono**: la posizione non viene mai inviata al server.
- Mappa dei post ("Dove si parla adesso"): una bolla per comune con i post locali degli ultimi 60 giorni.
- Verificato nei test con uno stile simulato (dal mio ambiente il server delle mappe non è raggiungibile): avvio della
  mappa, bolle, tocco, posizione. Le **tessere vere** della mappa le vedrai tu al primo avvio.

## 3) Modificare il database (migrazioni)

All'avvio l'app applica da sola le migrazioni in `backend/migrations/versions`: un database vuoto viene creato, uno esistente
viene aggiornato **senza perdere dati** (anche quello creato dalla prima versione di PULSE). Se aggiungi una colonna in
`app/models.py`:

```powershell
cd backend
.venv\Scripts\alembic revision --autogenerate -m "aggiungo colonna X"
```

Rileggi il file generato, poi riavvia l'app (o `fly deploy`). Il test `test_schema_matches_models` fallisce se dimentichi una migrazione.

## Cifratura: cosa vedi tu e cosa vede l'app

- **Ricerca mentre si scrive** (persone per nome utente o nome reale, anche solo le prime lettere, più le città): i nomi
  restano cifrati; per la ricerca si salvano solo **impronte HMAC** dei pezzi iniziali delle parole
  (tabella `name_prefixes`, `backend/app/search.py`). Le persone già registrate vengono indicizzate dall'aggiornamento.

| Dove | Cosa c'è | Cosa vedi se lo apri |
| --- | --- | --- |
| Database (Neon) | utenti, post, commenti, voti, follow | nome utente, nome reale, bio, città e testi come `e1:8Wy1zJLB…` (illeggibili); id, date, contatori in chiaro |
| Storage (Tigris) | le foto (2 misure per foto + foto profilo) | file cifrati che non si aprono come immagini |
| Secret dell'app (Fly) | `PULSE_DATA_KEY` | la chiave: separata da database e storage |

- Il database **non contiene immagini**: solo l'id e le dimensioni di ogni foto.
- Per l'unicità del nome utente e per i filtri per città si usa un **indice cieco** (HMAC): confronta senza conservare il valore.
  Conseguenza: la ricerca persone funziona solo con il **nome utente esatto**.
- Onestà: l'app deve mostrare nomi e post agli utenti, quindi il server li decifra quando servono. Chi ha accesso al server **e**
  alla chiave potrebbe leggerli: per i contenuti pubblici di un social non esiste una cifratura end-to-end come in Palacan.
  La cifratura protegge da chi accede al database, ai backup o allo storage (fornitori, furti, curiosi), e da te stesso quando
  navighi il database.
- Il test `test_database_and_storage_contain_no_readable_personal_data` lo verifica a ogni esecuzione.

## Spazio occupato dalle foto

Ogni foto è salvata in WebP in due misure (anteprima 640 px + grande 1600 px); l'originale non viene mai conservato.
Misurato su una foto da telefono da 12 MP (2,4 MB): **circa 380 KB** salvati nel caso peggiore (immagine molto dettagliata),
tipicamente 200-350 KB. Quindi i 5 GB gratuiti di Tigris bastano per circa **13.000-25.000 foto**; oltre, 0,02 $/GB al mese
(100.000 foto ≈ 20-40 GB ≈ 0,40-0,80 $/mese). Per risparmiare ancora si può abbassare la misura "grande" in `app/media.py`.
Il database resta piccolissimo: per i testi, il piano gratuito di Neon (1 GB per progetto) basta per moltissimi utenti.

## Sicurezza e privacy già presenti

- Password con Argon2id; codice di recupero (100 bit) salvato solo come hash e **ruotato** a ogni recupero.
- Hash limitati a 4 alla volta: un picco di login non manda la VM in crash per mancanza di memoria.
- Sessione in cookie `httpOnly` + `SameSite=Lax` + `Secure` in produzione (niente token in `localStorage`); cambiare password invalida le vecchie sessioni.
- Rate limit su registrazione (per IP, largo per le reti condivise, + tetto globale), login (per IP e per IP+nickname), recupero, voti,
  eliminazione account, admin; verifica password a tempo costante.
- Un voto per utente e domanda (vincolo nel DB); il gruppo "città" è calcolato dal server, non dal browser.
- Header di sicurezza e CSP rigida (nessuno script/font esterno: anche per la privacy). Un solo cookie tecnico: niente banner cookie.
- Dato per città mostrato solo sopra soglia; i risultati si vedono **dopo** aver votato; la "sintonia" esclude il proprio voto.
- **GDPR**: consenso esplicito obbligatorio alla registrazione (salvato con data e versione dell'informativa), pagina `/privacy`,
  eliminazione dell'account in autonomia (cancella account e risposte; le proposte già pubblicate restano anonime).
- Proposte: moderate, max 3 al giorno, niente link.
- **Foto**: accettate solo se sono davvero JPEG/PNG/WebP (non conta l'estensione); rifiutate se enormi ("decompression bomb");
  ricodificate da zero in WebP **senza alcun metadato** (niente GPS) in due misure; l'originale non viene mai salvato.
  Il bucket resta privato: le foto passano dal backend, che controlla login e visibilità (foto di contenuti nascosti = 404).
- **Post**: max 4 foto per post e 1 per commento, limiti di frequenza, richieste troppo grandi rifiutate prima di leggerle,
  segnalazioni (una per utente) con nascondimento automatico, rimozione e ban dal pannello admin; eliminando un post o
  l'account spariscono anche le foto dallo storage.

## Cose da sapere prima di fare "hype" (onestà)

- **L'informativa in `/privacy` è una bozza tecnica**, scritta sulla base di ciò che il codice fa davvero. Prima del lancio pubblico
  falla rivedere da un professionista privacy: in particolare età minima (14 è il limite italiano per il consenso ai servizi online,
  ma per dati politici potresti preferire 18), i contratti con i fornitori (DPA di Fly.io e Neon) e i trasferimenti extra-UE.
  Mancano ancora i **termini d'uso** (regole di comportamento, moderazione).
- **Un account = un voto non è garantito**: senza verifica d'identità si possono creare più account. I risultati sono "degli utenti di PULSE",
  e l'app lo dice ovunque. Non presentarli come sondaggi rappresentativi.
- **Rate limit in memoria**: funziona con 1 sola macchina Fly (configurazione attuale). Per più macchine serve Redis/Upstash.
- **Costi**: verifica i piani *attuali* di Fly.io (per i nuovi account potrebbe non esserci più un free tier) e di Neon (ha un piano gratuito).
  `auto_stop_machines` tiene il costo minimo, ma al primo accesso dopo una pausa c'è qualche secondo di avvio.
- **Verificato**: i 57 test backend passano su SQLite e su **PostgreSQL 16** (storage S3 simulato con moto); adozione e
  aggiornamento di un database creato con la v1 provati su PostgreSQL; build del frontend; due percorsi completi nel browser
  (Chromium, schermo da telefono): voto/pulse/privacy/eliminazione account, e il feed con due utenti (post con foto,
  visualizzatore, commenti e risposte con foto, ordine dei thread, segnalazione, eliminazione), profili e follow (onboarding con
  foto, richiesta, badge, accetta, "segui anche tu", feed Seguiti, ricerca, modifica profilo, smetti di seguire), e da ospite
  (feed, foto, città, commenti, profili senza account; ogni azione chiede di entrare; dopo la registrazione si torna lì),
  mappa e moderazione (ricerca comuni, posizione simulata, bolle, filtro insulti, auto-nascondimento, pannello admin).
- **Contenuti pubblici**: post, commenti, foto e profili sono visibili a chiunque, anche senza account (i voti no: restano
  anonimi). Gli ospiti hanno un limite di richieste per IP contro chi vuole copiare i dati in massa.
- **Nomi reali**: non c'è verifica dell'identità. Chiunque può scrivere "Mario Rossi" o il nome di un politico: per questo c'è la
  segnalazione "Si spaccia per un'altra persona" e il reset del profilo dal pannello admin. Un badge "verificato" richiederebbe
  un controllo dei documenti (o SPID), fuori dallo scopo di questa versione.
- **Moderazione delle foto**: non c'è un filtro automatico per contenuti illegali o espliciti. Si basa su segnalazioni e
  moderatori: con utenti reali controlla le segnalazioni ogni giorno. Valuta in futuro un servizio di analisi automatica.
  **Non verificati**: la connessione a *Neon* e a *Tigris* reali (se `/api/health` dà errore dopo il deploy, controlla
  `DATABASE_URL`; se il caricamento foto dà errore 503, controlla i secret di `fly storage create`) e `docker build` (nel mio ambiente il demone Docker non è attivo). Per ripetere i test su Neon, con un database **vuoto e usa-e-getta**:
  `$env:PULSE_TEST_DATABASE_URL="postgresql://..."; cd backend; .venv\Scripts\python -m pytest`.

## Ancora da fare

1. Notifiche (ti hanno risposto, hanno accettato la tua richiesta) e blocco degli utenti.
2. Logout "vero" lato server (oggi il logout cancella il cookie; una sessione copiata resta valida fino alla scadenza di 30 giorni).
3. Anteprima immagine (OG image) per i link `/q/ID` condivisi su WhatsApp.
4. Soglia → azione: a N voti nel comune, genera la lettera/PEC pronta da inviare al consigliere + tracker "inviata → risposta".
5. Mappa a calore (Leaflet/OpenStreetMap) e "argomento contrario più convincente".

## Licenza

PULSE è software libero, rilasciato sotto **GNU Affero General Public License v3.0** (vedi [`LICENSE`](LICENSE)).
Puoi usare, studiare, modificare e ridistribuire il codice. Se lo usi per offrire un servizio online, anche
modificato, devi rendere disponibile il codice sorgente delle tue modifiche agli utenti di quel servizio.


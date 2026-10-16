import type { ReactNode } from "react";
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  Ban,
  BarChart3,
  Bell,
  Bug,
  CodeXml,
  Database,
  ExternalLink,
  EyeOff,
  Fingerprint,
  Flag,
  Gauge,
  GitBranch,
  HeartHandshake,
  ImageOff,
  KeyRound,
  Lightbulb,
  Lock,
  MapPinned,
  Radar,
  Scale,
  ScrollText,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import type { Meta } from "../../types";
import PrivacyPage from "../PrivacyPage";

export type InfoSlug = "ecosistema" | "sicurezza" | "open-source" | "termini" | "privacy";
export const INFO_SLUGS: InfoSlug[] = ["ecosistema", "sicurezza", "open-source", "termini", "privacy"];

export function parseInfo(path: string): InfoSlug | null {
  const m = path.match(/^\/(ecosistema|sicurezza|open-source|termini|privacy)\/?$/);
  return m ? (m[1] as InfoSlug) : null;
}

type Go = (slug: InfoSlug) => void;

/* ------------------------------------------------------------------------------------------ */
/* Mattoncini grafici condivisi                                                               */
/* ------------------------------------------------------------------------------------------ */

function Hero({ kicker, title, children, icon }: { kicker: string; title: ReactNode; children: ReactNode; icon: ReactNode }) {
  return (
    <header className="rise relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-pulse/[0.14] via-white/[0.03] to-transparent px-6 pb-7 pt-6 ring-1 ring-white/[0.07]">
      <div aria-hidden className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-pulse/20 blur-3xl" />
      <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-pulse text-ink">{icon}</span>
      <p className="mt-5 text-xs font-bold uppercase tracking-[0.16em] text-pulse">{kicker}</p>
      <h1 className="mt-2 font-display text-[2.1rem] font-extrabold leading-[1.05] tracking-[-0.03em] text-zinc-50">{title}</h1>
      <div className="mt-3 text-[15px] leading-6 text-zinc-300">{children}</div>
    </header>
  );
}

function Block({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-9">
      <h2 className="font-display text-xl font-bold tracking-tight text-zinc-50">{title}</h2>
      <div className="mt-3 space-y-3 text-[15px] leading-6 text-zinc-300">{children}</div>
    </section>
  );
}

function Card({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="rounded-[1.5rem] bg-white/[0.04] p-5 ring-1 ring-white/[0.06]">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-pulse/[0.12] text-pulse">{icon}</span>
        <h3 className="font-display text-[17px] font-bold leading-tight text-zinc-50">{title}</h3>
      </div>
      <div className="mt-3 space-y-2 text-sm leading-6 text-zinc-400">{children}</div>
    </div>
  );
}

function Stat({ n, label }: { n: string; label: string }) {
  return (
    <div className="rounded-2xl bg-white/[0.04] px-3 py-4 text-center ring-1 ring-white/[0.06]">
      <p className="font-display text-2xl font-extrabold leading-none text-pulse tabular">{n}</p>
      <p className="mt-1.5 text-[11px] font-semibold leading-4 text-zinc-400">{label}</p>
    </div>
  );
}

function Code({ children }: { children: ReactNode }) {
  return <code className="rounded-md bg-white/[0.07] px-1.5 py-0.5 font-mono text-[13px] text-zinc-200">{children}</code>;
}

function Next({ go, to, title, text }: { go: Go; to: InfoSlug; title: string; text: string }) {
  return (
    <button
      onClick={() => go(to)}
      className="mt-10 flex w-full items-center gap-4 rounded-[1.5rem] bg-white/[0.05] p-5 text-left ring-1 ring-white/[0.07] transition hover:bg-white/[0.08]"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-semibold text-zinc-500">Continua</span>
        <span className="mt-0.5 block font-display text-lg font-bold text-zinc-50">{title}</span>
        <span className="mt-0.5 block text-sm text-zinc-400">{text}</span>
      </span>
      <ArrowRight size={20} className="shrink-0 text-pulse" />
    </button>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* Ecosistema                                                                                 */
/* ------------------------------------------------------------------------------------------ */

function Ecosistema({ go, meta }: { go: Go; meta: Meta }) {
  const minRes = meta.privacy?.min_results ?? 5;
  return (
    <>
      <Hero kicker="L'ecosistema PULSE" title={<>Il polso della tua città, <span className="text-pulse">in tempo reale.</span></>} icon={<Activity size={22} />}>
        <p>
          PULSE non è l'ennesimo social dove si urla di più. È il posto dove chi vive un luogo dice cosa ne pensa, con un
          voto, una foto, una domanda. E dove conta quante persone coinvolgi, non quanti like collezioni.
        </p>
      </Hero>

      <div className="mt-5 grid grid-cols-3 gap-2.5">
        <Stat n="7.896" label="comuni italiani" />
        <Stat n="3" label="risposte: Sì, Dipende, No" />
        <Stat n="0" label="email o telefoni richiesti" />
      </div>

      <Block title="Tutto quello che c'è dentro">
        <div className="grid gap-3">
          <Card icon={<Activity size={20} />} title="Pulse: il feed">
            <p>Post con foto dalla tua città e da tutta Italia. Commenti e risposte. In ordine di tempo: nessun algoritmo decide cosa devi vedere.</p>
          </Card>
          <Card icon={<BarChart3 size={20} />} title="Sondaggi">
            <p>
              Una domanda, tre risposte: <strong className="text-yes">Sì</strong>, <strong className="text-maybe">Dipende</strong>,{" "}
              <strong className="text-no">No</strong>. Con foto e scadenza. Scorri, vota e scopri come la pensano gli altri, ma solo dopo
              aver votato, così nessuno ti influenza.
            </p>
          </Card>
          <Card icon={<MapPinned size={20} />} title="Città e mappa">
            <p>
              Ogni comune ha la sua piazza: post e sondaggi di quel luogo. Chiunque può partecipare, e nei risultati vedi separati
              chi è <em>di qui</em> e chi vota <em>da fuori</em>.
            </p>
          </Card>
          <Card icon={<Lightbulb size={20} />} title="Proposte: dal post al voto">
            <p>
              Hai un'idea per la tua città? Scrivila come proposta. Chi è d'accordo tocca «Sostengo»: raggiunti i sostenitori, la
              proposta diventa da sola un sondaggio e tutti possono votarla. Sui post normali, «Anch'io» dice «succede anche a me».
            </p>
          </Card>
          <Card icon={<Scale size={20} />} title="Le ragioni e la domanda del giorno">
            <p>
              Sotto ogni sondaggio, «Perché sì» e «Perché no» affiancati: le ragioni più utili salgono in cima, senza nomi, così si
              decide sugli argomenti e non sulle persone. Ogni giorno, in cima al Pulse, una domanda a cui non hai ancora risposto:
              prima della tua città, poi di tutta Italia.
            </p>
          </Card>
          <Card icon={<Radar size={20} />} title="Persone coinvolte">
            <p>
              La nostra metrica. Non i follower: quante persone <strong className="text-zinc-200">diverse</strong> hanno risposto ai tuoi post
              o votato i tuoi sondaggi. Ognuna conta una volta. Premia la qualità, non il rumore.
            </p>
          </Card>
          <Card icon={<Users size={20} />} title="Profili, follow e privacy">
            <p>Profilo pubblico o privato: con il privato i tuoi contenuti li vede solo chi vi seguite a vicenda. Gli elenchi di follower li vedi solo tu.</p>
          </Card>
          <Card icon={<Bell size={20} />} title="Attività">
            <p>Chi ti segue, chi ti risponde, quando finisce un sondaggio che hai votato. Tutto in un posto, senza rumore.</p>
          </Card>
        </div>
      </Block>

      <Block title="I nostri principi">
        <ol className="space-y-4">
          {[
            ["Il voto è segreto.", `Nessuno, nemmeno chi crea il sondaggio, vede cosa hai votato. Le percentuali compaiono solo da ${minRes} voti in su.`],
            ["Dati minimi.", "Nome utente e password. Niente email, numero di telefono o posizione GPS."],
            ["Nessun algoritmo nascosto.", "I contenuti arrivano in ordine di tempo. Sei tu a scegliere chi seguire e quali città guardare."],
            ["Codice aperto.", "Come funziona PULSE, crittografia compresa, lo può verificare chiunque."],
          ].map(([t, d], i) => (
            <li key={t} className="flex gap-4">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-pulse font-display text-sm font-extrabold text-ink">{i + 1}</span>
              <span>
                <strong className="block text-zinc-50">{t}</strong>
                <span className="text-sm text-zinc-400">{d}</span>
              </span>
            </li>
          ))}
        </ol>
      </Block>

      <Next go={go} to="sicurezza" title="Sicurezza e crittografia" text="Come proteggiamo i tuoi dati e il tuo voto" />
    </>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* Sicurezza                                                                                  */
/* ------------------------------------------------------------------------------------------ */

function Sicurezza({ go, meta }: { go: Go; meta: Meta }) {
  const minRes = meta.privacy?.min_results ?? 5;
  return (
    <>
      <Hero kicker="Sicurezza" title={<>Progettata per <span className="text-pulse">proteggerti.</span></>} icon={<ShieldCheck size={22} />}>
        <p>
          Chi apre il nostro database vede solo dati illeggibili. Il tuo voto non è mai collegato al tuo nome davanti agli altri.
          E puoi verificare tutto questo leggendo il codice.
        </p>
      </Hero>

      <Block title="Cosa facciamo">
        <div className="grid gap-3">
          <Card icon={<Database size={20} />} title="Database cifrato">
            <p>
              Nome utente, nome e cognome, bio, città, testi di post e commenti sono salvati cifrati con <strong className="text-zinc-200">AES-256-GCM</strong>,
              lo standard usato da banche e governi. Anche le foto sono file cifrati.
            </p>
            <p>
              La chiave non sta nel database né nell'archivio delle foto: chi ruba un backup ha in mano solo testo incomprensibile. Per ogni uso viene
              ricavata una chiave diversa (HKDF-SHA256).
            </p>
          </Card>
          <Card icon={<Search size={20} />} title="Ricerca senza dati in chiaro">
            <p>
              Per trovare le persone mentre scrivi usiamo <strong className="text-zinc-200">indici ciechi</strong> (HMAC-SHA256): impronte che
              permettono il confronto senza conservare il nome leggibile.
            </p>
          </Card>
          <Card icon={<KeyRound size={20} />} title="Password con Argon2">
            <p>
              Le password e il codice di recupero sono conservati con <strong className="text-zinc-200">Argon2</strong>, l'algoritmo vincitore della
              Password Hashing Competition. Non si possono "decifrare": nemmeno noi conosciamo la tua password. Se la cambi, tutte le sessioni aperte si chiudono.
            </p>
          </Card>
          <Card icon={<EyeOff size={20} />} title="Voto segreto, davvero">
            <p>
              Nell'app nessuno vede chi ha votato cosa. I risultati si vedono solo dopo aver votato e le percentuali compaiono da {minRes} voti in su: con 1 o 2
              voti si capirebbe come ha votato qualcuno. Lo stesso vale per i gruppi più piccoli, come i residenti di una città.
            </p>
            <p>
              E nemmeno nel database: un voto non contiene il tuo codice utente ma un'<strong className="text-zinc-200">impronta</strong> che
              senza la chiave non porta a nessuno, e il voto stesso (favorevole, dipende, contrario) è <strong className="text-zinc-200">cifrato</strong>.
              Le percentuali si calcolano da contatori che contengono solo numeri.
            </p>
          </Card>
          <Card icon={<ImageOff size={20} />} title="Foto ripulite">
            <p>Ogni foto viene ricodificata da zero: spariscono i dati nascosti (EXIF), compresa la posizione GPS in cui è stata scattata.</p>
          </Card>
          <Card icon={<Lock size={20} />} title="Profilo privato">
            <p>Con il profilo privato post e sondaggi li vede solo chi vi seguite a vicenda. Vale ovunque: feed, città, mappa e link condivisi.</p>
          </Card>
          <Card icon={<Gauge size={20} />} title="Difese sempre attive">
            <p>Connessione cifrata (HTTPS), limiti contro chi prova a indovinare le password, protezioni del browser contro script esterni e clickjacking.</p>
          </Card>
        </div>
      </Block>

      <Block title="Cosa non facciamo">
        <ul className="space-y-2.5">
          {[
            "Non chiediamo email, telefono, documenti o posizione GPS.",
            "Non vendiamo dati e non usiamo tracker pubblicitari o di analisi.",
            "Non mostriamo a nessuno come hai votato.",
          ].map((t) => (
            <li key={t} className="flex gap-3">
              <Ban size={18} className="mt-0.5 shrink-0 text-no" />
              <span>{t}</span>
            </li>
          ))}
        </ul>
      </Block>

      <Block title="In tutta onestà">
        <p className="rounded-[1.5rem] bg-maybe/[0.08] p-5 text-sm leading-6 text-zinc-300 ring-1 ring-maybe/20">
          PULSE è un social: per mostrarti post e profili, il server deve poterli leggere. Non è quindi una cifratura "end-to-end" come in una chat
          privata. Lo stesso vale per i voti: chi ruba il database non può sapere come hai votato, ma chi gestisce il server e la sua chiave segreta
          potrebbe, con un lavoro mirato, ricostruirlo (succede in qualsiasi app con un voto a persona). Proprio per questo il codice è pubblico:
          chiunque può controllare cosa facciamo con i dati, senza doverci credere sulla parola.
        </p>
      </Block>

      <Next go={go} to="open-source" title="Open source" text="Il codice è pubblico: controllalo tu" />
    </>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* Open source                                                                                */
/* ------------------------------------------------------------------------------------------ */

function OpenSource({ go, meta }: { go: Go; meta: Meta }) {
  const url = meta.source_url;
  const contact = meta.privacy?.contact;
  const files: [string, string][] = [
    ["backend/app/crypto.py", "Cifratura AES-256-GCM e indici ciechi"],
    ["backend/app/security.py", "Password Argon2, sessioni e limiti anti-abuso"],
    ["backend/app/votes.py", "Voti cifrati e separati dalla persona, contatori"],
    ["backend/app/polls.py", "Voto segreto e soglie dei risultati"],
    ["backend/app/privacy.py", "Regole dei profili privati"],
    ["backend/app/reach.py", "Come si contano le persone coinvolte"],
    ["backend/app/media.py", "Foto ricodificate e senza dati nascosti"],
    ["backend/app/moderation.py", "Filtro automatico e segnalazioni"],
  ];
  return (
    <>
      <Hero kicker="Open source" title={<>Non fidarti. <span className="text-pulse">Verifica.</span></>} icon={<CodeXml size={22} />}>
        <p>
          Il codice di PULSE è pubblico. Come cifriamo il database, come teniamo segreto il voto, come contiamo le persone coinvolte:
          tutto è lì, riga per riga.
        </p>
      </Hero>

      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="source-link"
          className="mt-5 flex items-center justify-center gap-2.5 rounded-2xl bg-pulse py-4 font-display text-[17px] font-extrabold text-ink transition hover:brightness-110"
        >
          <CodeXml size={20} /> Vedi il codice su GitHub <ExternalLink size={16} />
        </a>
      ) : (
        <div data-testid="source-soon" className="mt-5 rounded-2xl bg-white/[0.04] p-4 text-center ring-1 ring-dashed ring-white/15">
          <span className="flex items-center justify-center gap-2.5 font-display text-[17px] font-extrabold text-zinc-400">
            <CodeXml size={20} /> Vedi il codice su GitHub
          </span>
          <span className="mt-1 block text-xs font-semibold text-pulse">Repository in arrivo</span>
        </div>
      )}

      <Block title="Cosa puoi controllare">
        <p>Ogni promessa delle pagine Sicurezza ed Ecosistema corrisponde a un file preciso:</p>
        <ul className="divide-y divide-white/[0.06] overflow-hidden rounded-[1.5rem] bg-white/[0.04] ring-1 ring-white/[0.06]">
          {files.map(([f, d]) => (
            <li key={f} className="px-4 py-3">
              <Code>{f}</Code>
              <span className="mt-1 block text-sm text-zinc-400">{d}</span>
            </li>
          ))}
        </ul>
      </Block>

      <Block title="Perché è importante">
        <div className="grid gap-3">
          <Card icon={<Fingerprint size={20} />} title="Fiducia verificabile">
            <p>Molte app dicono di proteggere i tuoi dati. Noi ti mostriamo come. Esperti e curiosi possono leggere, controllare, segnalare.</p>
          </Card>
          <Card icon={<Bug size={20} />} title="Più occhi, meno errori">
            <p>
              Hai trovato un problema di sicurezza? Scrivici in privato{contact ? <> a <strong className="text-zinc-200">{contact}</strong></> : null} prima di
              renderlo pubblico: lo sistemiamo e ti ringraziamo.
            </p>
          </Card>
          <Card icon={<GitBranch size={20} />} title="Costruiamola insieme">
            <p>Idee, correzioni e miglioramenti sono benvenuti: apri una segnalazione o una proposta di modifica sul repository.</p>
          </Card>
        </div>
      </Block>

      <p className="mt-6 text-xs leading-5 text-zinc-500">
        Tecnologie: FastAPI, SQLAlchemy, PostgreSQL, React, Tailwind, MapLibre e librerie open source. Licenza GNU AGPL-3.0: puoi usare, studiare e modificare il codice; chi lo usa per offrire un servizio online deve
        pubblicare anche le proprie modifiche.
      </p>

      <Next go={go} to="termini" title="Termini di utilizzo" text="Le regole che rendono PULSE un bel posto" />
    </>
  );
}

/* ------------------------------------------------------------------------------------------ */
/* Termini                                                                                    */
/* ------------------------------------------------------------------------------------------ */

function Term({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className="mt-8" id={`art-${n}`}>
      <h2 className="flex items-baseline gap-2.5 font-display text-lg font-bold text-zinc-50">
        <span className="font-display text-sm font-extrabold text-pulse tabular">{String(n).padStart(2, "0")}</span>
        {title}
      </h2>
      <div className="mt-2 space-y-2 pl-8 text-sm leading-6 text-zinc-300">{children}</div>
    </section>
  );
}

function Termini({ meta }: { meta: Meta }) {
  const age = meta.privacy?.min_age ?? 14;
  const contact = meta.privacy?.contact;
  const controller = meta.privacy?.controller;
  const reports = meta.report_threshold ?? 3;
  return (
    <>
      <Hero kicker="Termini di utilizzo" title={<>Le regole di <span className="text-pulse">PULSE.</span></>} icon={<ScrollText size={22} />}>
        <p>Poche regole, chiare. Servono a una cosa sola: far sì che qui si possa discutere di tutto, senza che nessuno venga calpestato.</p>
        <p className="mt-2 text-xs text-zinc-500">Versione {meta.terms_version ?? "—"}</p>
      </Hero>

      <section className="mt-6 rounded-[1.5rem] bg-white/[0.04] p-5 ring-1 ring-white/[0.06]">
        <h2 className="flex items-center gap-2 font-display text-lg font-bold text-zinc-50">
          <HeartHandshake size={19} className="text-pulse" /> In breve
        </h2>
        <ul className="mt-3 space-y-2 text-sm leading-6 text-zinc-300">
          <li>✅ Critica le idee, rispetta le persone.</li>
          <li>✅ Pubblica solo ciò che hai il diritto di pubblicare.</li>
          <li>✅ Un account per persona: niente voti gonfiati.</li>
          <li>🚫 Niente odio, minacce, dati personali altrui o contenuti illegali.</li>
          <li>⚖️ Sei responsabile di ciò che pubblichi.</li>
        </ul>
      </section>

      <Term n={1} title="Cos'è PULSE">
        <p>
          PULSE è un servizio gratuito per condividere post, foto e sondaggi su ciò che succede nelle città italiane. Usandolo accetti questi
          Termini e l'<a href="/privacy" className="font-semibold text-pulse underline">informativa privacy</a>.
          {controller ? <> Il servizio è gestito da <strong>{controller}</strong>.</> : null}
        </p>
      </Term>

      <Term n={2} title="Chi può iscriversi">
        <p>Devi avere almeno {age} anni. Ti iscrivi con un nome utente e una password: tienili al sicuro, insieme al codice di recupero che ti diamo alla registrazione. Senza codice non possiamo recuperare l'account.</p>
      </Term>

      <Term n={3} title="Un account, una persona">
        <p>
          Ogni persona usa un solo account e non si spaccia per qualcun altro (persone, enti, aziende). Creare più account per gonfiare i voti o
          aggirare un blocco non è consentito.
        </p>
      </Term>

      <Term n={4} title="Cosa non si può pubblicare">
        <ul className="list-disc space-y-1 pl-5">
          <li>insulti, molestie, minacce, incitamento all'odio o alla violenza;</li>
          <li>dati personali di altri (indirizzi, telefoni, documenti, targhe) e foto di persone riconoscibili senza il loro consenso;</li>
          <li>contenuti illegali, pornografici o che coinvolgono minori;</li>
          <li>materiale protetto da diritti che non sono tuoi;</li>
          <li>spam, pubblicità ingannevole, truffe e notizie false spacciate per vere.</li>
        </ul>
      </Term>

      <Term n={5} title="I tuoi contenuti">
        <p>
          Ciò che pubblichi resta tuo. Ci dai il permesso di mostrarlo dentro PULSE, alle persone che possono vederlo secondo le tue impostazioni,
          finché non lo elimini. Sei responsabile di ciò che pubblichi: assicurati di averne il diritto.
        </p>
      </Term>

      <Term n={6} title="Segnalazioni e moderazione">
        <p>
          Chiunque può segnalare un contenuto o un profilo con il menu "⋯". Quando {reports} persone diverse segnalano lo stesso contenuto, si
          nasconde da solo in attesa di una verifica. Possiamo rimuovere contenuti che violano questi Termini e sospendere o chiudere gli account
          che li violano in modo grave o ripetuto.
        </p>
      </Term>

      <Term n={7} title="Sondaggi e risultati">
        <p>
          I risultati mostrano come hanno votato gli utenti di PULSE: non sono un sondaggio statistico rappresentativo della popolazione e non
          vanno presentati come tale. Il voto è segreto e non viene mostrato a nessuno.
        </p>
      </Term>

      <Term n={8} title="Eliminare l'account">
        <p>Puoi eliminare il tuo account quando vuoi da Profilo → Impostazioni. Con l'account si cancellano anche i tuoi post, commenti, foto e voti.</p>
      </Term>

      <Term n={9} title="Il servizio">
        <p>
          Facciamo del nostro meglio perché PULSE funzioni sempre e in sicurezza, ma il servizio è offerto così com'è: possono capitare
          interruzioni o errori. Nei limiti di legge non rispondiamo dei contenuti pubblicati dagli utenti.
        </p>
      </Term>

      <Term n={10} title="Modifiche e legge applicabile">
        <p>
          Se cambiamo questi Termini aggiorniamo la versione qui sopra e, per le modifiche importanti, te lo segnaliamo nell'app. I Termini sono
          regolati dalla legge italiana; restano salvi i diritti che la legge ti riconosce come consumatore.
        </p>
      </Term>

      <Term n={11} title="Contatti">
        <p>{contact ? <>Per domande o segnalazioni scrivi a <strong>{contact}</strong>.</> : "Per domande o segnalazioni usa il contatto indicato nell'informativa privacy."}</p>
      </Term>

      <div className="mt-10 flex items-center gap-3 rounded-[1.5rem] bg-white/[0.04] p-5 ring-1 ring-white/[0.06]">
        <Flag size={20} className="shrink-0 text-pulse" />
        <p className="text-sm leading-6 text-zinc-300">Vedi qualcosa che non va? Segnalalo con "⋯ → Segnala": ci aiuti a tenere PULSE un bel posto.</p>
      </div>
      <p className="mt-4 flex items-center gap-1.5 text-xs text-zinc-600">
        <Scale size={13} /> Documento informativo. Verificalo con un consulente legale prima del lancio pubblico.
      </p>
    </>
  );
}

/* ------------------------------------------------------------------------------------------ */

export default function InfoPage({ slug, meta, onBack, go }: { slug: InfoSlug; meta: Meta; onBack: () => void; go: Go }) {
  return (
    <article className="pb-10" data-testid={`info-${slug}`}>
      <button onClick={onBack} className="mb-4 flex items-center gap-1.5 text-sm font-semibold text-zinc-400 hover:text-white">
        <ArrowLeft size={17} /> Indietro
      </button>
      {slug === "ecosistema" && <Ecosistema go={go} meta={meta} />}
      {slug === "sicurezza" && <Sicurezza go={go} meta={meta} />}
      {slug === "open-source" && <OpenSource go={go} meta={meta} />}
      {slug === "termini" && <Termini meta={meta} />}
      {slug === "privacy" && <PrivacyPage info={meta.privacy} />}
      <p className="mt-10 flex items-center justify-center gap-1.5 text-xs text-zinc-600">
        <Sparkles size={12} /> PULSE · fatto in Italia, con codice aperto
      </p>
    </article>
  );
}

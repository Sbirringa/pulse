import type { ReactNode } from "react";
import { FileLock2 } from "lucide-react";
import type { PrivacyInfo } from "../types";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-extrabold">{title}</h2>
      <div className="mt-2 space-y-2 text-sm leading-6 text-zinc-300">{children}</div>
    </section>
  );
}

/**
 * Informativa privacy (art. 13 GDPR). Il testo descrive ciò che il codice fa davvero:
 * se cambi il trattamento dei dati, aggiorna questo testo e PRIVACY_VERSION nel backend.
 */
export default function PrivacyPage({ info }: { info: PrivacyInfo | null }) {
  const controller = info?.controller;
  const contact = info?.contact;
  const incomplete = !controller || !contact;

  return (
    <div>
      <header className="rise relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-pulse/[0.14] via-white/[0.03] to-transparent px-6 pb-7 pt-6 ring-1 ring-white/[0.07]">
        <div aria-hidden className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-pulse/20 blur-3xl" />
        <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-pulse text-ink"><FileLock2 size={22} /></span>
        <p className="mt-5 text-xs font-bold uppercase tracking-[0.16em] text-pulse">Privacy</p>
        <h1 className="mt-2 font-display text-[2.1rem] font-extrabold leading-[1.05] tracking-[-0.03em] text-zinc-50">Informativa privacy</h1>
        <p className="mt-3 text-[15px] leading-6 text-zinc-300">Quali dati trattiamo, perché e come puoi controllarli.</p>
        <p className="mt-2 text-xs text-zinc-500">Versione {info?.version ?? "—"}</p>
      </header>

      {incomplete && (
        <p className="mt-6 rounded-xl bg-maybe/10 p-4 text-sm text-maybe">
          Informativa incompleta: titolare e contatto non sono configurati (PULSE_CONTROLLER_NAME e
          PULSE_CONTACT_EMAIL).
        </p>
      )}

      <Section title="Chi tratta i tuoi dati">
        <p>
          Titolare del trattamento: <strong>{controller ?? "[titolare non configurato]"}</strong>. Per qualsiasi
          richiesta sulla privacy scrivi a <strong>{contact ?? "[contatto non configurato]"}</strong>.
        </p>
      </Section>

      <Section title="Quali dati raccogliamo">
        <p>Pulse è progettata per raccogliere il minimo indispensabile. Non chiediamo nome, email, telefono, documenti né la posizione del dispositivo.</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Account: nickname scelto da te, password e codice di recupero (conservati solo in forma cifrata con hash irreversibile).</li>
          <li>Città, se decidi di indicarla: è una tua dichiarazione, non viene verificata.</li>
          <li>
            Le altre città di cui dichiari di essere (ci lavori o studi) quando partecipi a post e sondaggi riservati a una città.
            Sono salvate cifrate e le togli quando vuoi da Profilo → Impostazioni.
          </li>
          <li>
            Profilo, se decidi di compilarlo: nome e cognome, una breve bio e la foto profilo. Chi segui, chi ti segue e
            le richieste di follow.
          </li>
          <li>
            I tuoi voti ai sondaggi (favorevole, contrario, dipende) e i sondaggi che proponi. Il voto è salvato cifrato e senza il
            tuo codice utente: al suo posto c'è un'impronta che serve solo a evitare doppi voti e a mostrarti le tue risposte.
          </li>
          <li>
            I tuoi «Anch'io» sui post e i sostegni alle proposte: agli altri mostriamo solo il numero, mai i nomi. Quando una
            proposta raggiunge i sostenitori diventa un sondaggio e chi l'ha sostenuta riceve un avviso.
          </li>
          <li>
            Le ragioni che scrivi sotto i sondaggi («Perché sì», «Perché no») e quelle che segni come «Utile». Il testo è salvato
            cifrato e agli altri non mostriamo mai chi l'ha scritto né chi l'ha trovato utile, solo il numero.
          </li>
          <li>
            I post, i commenti e le foto che pubblichi su Pulse, e le segnalazioni che invii. Dalle foto
            eliminiamo automaticamente la posizione GPS e tutti gli altri dati nascosti (modello del telefono, data
            di scatto…): conserviamo solo una copia ricodificata dell'immagine, mai il file originale.
          </li>
          <li>Data e versione dell'informativa che hai accettato.</li>
          <li>
            Dati tecnici: l'indirizzo IP viene usato solo in memoria, per pochi minuti, per bloccare abusi (ad esempio
            troppi tentativi di accesso) e non viene salvato nel nostro database. I fornitori di hosting e database
            possono registrare log tecnici secondo le proprie policy.
          </li>
        </ul>
      </Section>

      <Section title="Opinioni politiche: dati particolari">
        <p>
          Le tue risposte possono rivelare le tue opinioni politiche, che il GDPR considera una categoria particolare di
          dati (art. 9). Le trattiamo solo con il tuo <strong>consenso esplicito</strong>, che dai alla registrazione
          (art. 6.1.a e art. 9.2.a GDPR). Puoi revocarlo in qualsiasi momento eliminando l'account: la revoca non
          rende illecito il trattamento svolto prima.
        </p>
      </Section>

      <Section title="Come li proteggiamo">
        <p>
          Nome utente, nome e cognome, bio, città e testi di post e commenti sono salvati nel database in forma cifrata
          (AES-256): chi apre il database vede solo stringhe illeggibili. Anche le foto sono archiviate come file
          cifrati. La chiave di cifratura è conservata separatamente dal database e dall'archivio delle foto.
        </p>
        <p>
          Per mostrarti l'app il nostro server decifra questi dati nel momento in cui servono: la cifratura protegge da
          accessi al database o ai backup, ma non è una cifratura "end-to-end" come quella di una chat privata, perché i
          contenuti di un social sono pensati per essere visti dagli altri utenti.
        </p>
      </Section>

      <Section title="Per cosa li usiamo">
        <ul className="list-disc space-y-1 pl-5">
          <li>Farti accedere e mostrarti le questioni nazionali e quelle della tua città.</li>
          <li>Calcolare risultati aggregati e il tuo profilo personale ("Il tuo Pulse"), visibile solo a te.</li>
          <li>Mostrare i tuoi post, commenti e foto agli altri utenti.</li>
          <li>Moderare proposte e contenuti segnalati e prevenire abusi.</li>
        </ul>
        <p>Niente pubblicità, niente profilazione commerciale, nessuna vendita o cessione dei dati.</p>
      </Section>

      <Section title="Che cosa è pubblico">
        <p>
          <strong>Voti ai sondaggi:</strong> il tuo nome non viene mai mostrato accanto ai tuoi voti.
          Gli altri vedono solo totali e percentuali. Il dato per città compare solo quando nella città ci sono almeno{" "}
          {info?.min_city_results ?? 5} risposte, per non esporre gruppi molto piccoli.
        </p>
        <p>
          <strong>Post e commenti:</strong> post, commenti e foto sono pubblici: li vede chiunque visiti Pulse, anche senza
          account, insieme al tuo nome utente e, per i post locali, alla città. Ricorda che quello che scrivi o mostri può rivelare informazioni su di te:
          non pubblicare dati personali tuoi o di altri, né foto di persone riconoscibili senza il loro consenso.
        </p>
        <p>
          <strong>Profilo:</strong> nome utente, nome e cognome, bio e foto profilo sono pubblici (li vede chiunque
          visiti Pulse), insieme al <em>numero</em> di chi segui e di chi ti segue. Gli <em>elenchi</em> di follower e seguiti li vedi
          solo tu. Con il <strong>profilo privato</strong> i tuoi post e sondaggi li vede solo chi vi seguite a vicenda (e ogni
          richiesta di follow la approvi tu). Puoi anche scegliere se approvare ogni richiesta con il profilo pubblico e togliere
          chi vuoi dai tuoi follower.
        </p>
        <p>
          <strong>Sondaggi proposti:</strong> quelle pubblicate dopo la moderazione sono visibili a tutti, senza il
          nome dell'autore.
        </p>
      </Section>

      <Section title="Per quanto tempo">
        <p>
          Conserviamo i dati finché il tuo account esiste. Puoi eliminare in qualsiasi momento un tuo post o commento:
          spariscono anche le foto. Quando elimini l'account cancelliamo subito account, profilo e foto profilo,
          risposte, post, commenti, ragioni sotto i sondaggi, foto, rapporti di follow e proposte non ancora pubblicate. Se un tuo commento ha ricevuto risposte, al suo posto resta la scritta
          "Commento eliminato", senza testo, foto né nickname. Le proposte già pubblicate restano senza alcun
          collegamento a te.
          Le copie di sicurezza del fornitore del database vengono sovrascritte entro il periodo di conservazione
          previsto dal servizio.
        </p>
      </Section>

      <Section title="A chi li affidiamo">
        <p>
          I dati sono ospitati da fornitori che agiscono come responsabili del trattamento: Fly.io (hosting
          dell'applicazione), Neon (database) e Tigris (archivio delle foto). Le mappe sono servite da OpenFreeMap
          (vedi "Mappa e posizione"). Questi fornitori possono trattare dati anche fuori dall'Unione Europea,
          con le garanzie previste dal GDPR, come le clausole contrattuali standard.
        </p>
      </Section>

      <Section title="Mappa e posizione">
        <p>
          Le mappe sono fornite da OpenFreeMap (dati © OpenStreetMap e OpenMapTiles): quando apri una mappa, il tuo
          browser scarica le immagini della mappa dai loro server, che vedono quindi il tuo indirizzo IP. Se non apri
          nessuna mappa, non vengono contattati.
        </p>
        <p>
          "Usa la mia posizione" è facoltativo e chiede prima il permesso: la posizione viene usata solo nel tuo
          browser per trovare il comune più vicino e non viene mai inviata a noi né salvata. A noi arriva solo il nome
          del comune che scegli. L'elenco dei comuni deriva dai confini amministrativi ISTAT (licenza CC-BY 4.0).
        </p>
      </Section>

      <Section title="Sondaggi di una città">
        <p>
          Un sondaggio può riguardare una sola città, ma può votare chiunque. Se la città del tuo profilo non è quella del
          sondaggio, ti chiediamo se sei di lì o se voti da fuori: la risposta resta legata al tuo
          voto e serve solo a mostrare i due gruppi separati nei risultati. Di ciascun gruppo mostriamo come ha votato solo
          quando ha abbastanza voti, così nessuno può risalire al voto di una singola persona. È una tua dichiarazione: non
          la verifichiamo.
        </p>
      </Section>

      <Section title="Il voto è segreto">
        <p>
          Nessuno, nemmeno chi ha creato il sondaggio, può vedere come hai votato. Mostriamo solo i totali, e le percentuali
          compaiono soltanto quando ha votato un numero minimo di persone: con due o tre voti si potrebbe indovinare il voto
          di qualcuno.
        </p>
      </Section>

      <Section title="Notifiche">
        <p>
          Ti avvisiamo dentro l'app quando qualcuno ti segue o chiede di seguirti, commenta un tuo post, ti risponde o
          quando si chiude un sondaggio che hai creato o a cui hai risposto. Una notifica contiene solo chi, cosa e dove:
          nessun testo. Conserviamo al massimo le ultime 200 per persona; spariscono se il contenuto viene eliminato e
          tutte insieme se elimini l'account. Niente email, niente notifiche fuori dall'app.
        </p>
      </Section>

      <Section title="Cookie">
        <p>
          Usiamo un solo cookie tecnico, necessario per mantenerti connesso (dura al massimo 30 giorni). Nessun cookie
          di profilazione o di terze parti, nessuno strumento di analisi esterno.
        </p>
      </Section>

      <Section title="I tuoi diritti">
        <p>
          Puoi chiedere accesso, rettifica, cancellazione, limitazione, portabilità dei dati e opporti al trattamento
          (artt. 15-22 GDPR). Puoi cambiare la città e cancellare l'account da solo, dalla sezione "Il tuo Pulse"; per
          le altre richieste scrivi al contatto indicato sopra. Hai anche diritto di proporre reclamo al Garante per la
          protezione dei dati personali (garanteprivacy.it).
        </p>
      </Section>

      <Section title="Segnalazioni e moderazione">
        <p>
          Post, commenti e sondaggi si pubblicano subito; un filtro automatico blocca i sondaggi con insulti evidenti.
          Puoi segnalare post, commenti, sondaggi e profili (ad esempio chi si spaccia per un'altra persona). Le
          segnalazioni sono anonime per chi le riceve. Un contenuto segnalato da più persone viene nascosto
          automaticamente; gli amministratori possono ripristinarlo, eliminarlo, cancellare nome, bio e foto di un
          profilo e sospendere gli account che violano le regole. Un contenuto segnalato da più
          persone viene nascosto finché un moderatore non lo esamina; i moderatori possono rimuoverlo e sospendere gli
          account che violano le regole.
        </p>
      </Section>

      <Section title="Età minima">
        <p>Pulse è riservata a chi ha almeno {info?.min_age ?? 14} anni.</p>
      </Section>
    </div>
  );
}

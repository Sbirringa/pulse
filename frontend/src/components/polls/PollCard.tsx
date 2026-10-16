import { useState } from "react";
import { Clock, Flag, Flame, Sun, MapPin, MoreHorizontal, RotateCcw, Share2, Trash2, Users } from "lucide-react";
import { api, errMsg } from "../../api";
import type { LocalSplit, Pct, Poll, Vote } from "../../types";
import { timeAgo, timeLeft } from "../../timeAgo";
import { useNav } from "../../nav";
import { shareLink } from "../../share";
import ActionSheet, { type Action } from "../ActionSheet";
import Lightbox from "../Lightbox";
import { AuthorAvatar, AuthorName } from "../social/AuthorLine";
import ReportDialog from "../social/ReportDialog";
import DeclareCity, { LocalOnly, isLocal } from "../social/DeclareCity";
import Polso, { STANCES } from "./Polso";
import Reasons from "./Reasons";

const people = (n: number) => (n === 1 ? "1 persona" : `${n} persone`);

/** Il sondaggio come appare nel feed, tra i Sondaggi e nei profili: si vota con un tocco, senza cambiare pagina. */
export default function PollCard({
  poll: initial,
  full = false,
  onDeleted,
  onVoted,
}: {
  poll: Poll;
  full?: boolean;
  onDeleted?: () => void;
  onVoted?: () => void;
}) {
  const { me, requireAuth, updateMe } = useNav();
  const [declaring, setDeclaring] = useState(false);
  const [poll, setPoll] = useState(initial);
  const [busy, setBusy] = useState<Vote | null>(null);
  const [justVoted, setJustVoted] = useState(false);
  const [changing, setChanging] = useState(false);
  const [cityLine, setCityLine] = useState<{ name: string; pct: Pct } | null>(null);
  const [menu, setMenu] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [photo, setPhoto] = useState(false);
  const [expanded, setExpanded] = useState(full);
  const [note, setNote] = useState("");
  const [asking, setAsking] = useState<Vote | null>(null);

  const left = timeLeft(poll.ends_at);
  const ended = poll.ended || Boolean(left?.ended);
  const showResults = poll.results && !changing;
  const canVote = poll.can_vote && !ended;

  // sondaggio di un'altra città: prima di votare si dice se si è "di qui" o "di fuori" (una volta per città)
  const localMe = poll.is_resident || isLocal(me, poll.city);
  const needsSide = poll.scope === "local" && !localMe;
  // riservato a chi è della città e io non ne sono: vedo i risultati e, se ne sono, lo dichiaro
  const outsider = Boolean(me) && poll.scope === "local" && poll.audience === "local" && !localMe;

  async function vote(v: Vote, resident?: boolean) {
    if (!me) {
      requireAuth("Entra per votare e vedere come la pensano gli altri");
      return;
    }
    const side = resident ?? (needsSide ? poll.my_resident ?? undefined : undefined);
    if (needsSide && side === undefined) {
      setAsking(v);
      return;
    }
    setAsking(null);
    setBusy(v);
    setNote("");
    try {
      const r = await api.vote(poll.id, v, needsSide ? side : undefined);
      if (needsSide && side && poll.city && me) updateMe({ places: [...(me.places ?? []), poll.city] }); // ricordato per la città
      setPoll((p) => ({
        ...p,
        my_vote: v,
        my_resident: poll.scope === "local" ? (needsSide ? side ?? null : true) : null,
        participants: r.total,
        results: { total: r.total, pct: r.pct, counts: r.counts, low_sample: r.low_sample, local: r.local ?? null },
      }));
      // il dato della mia città ha senso nei sondaggi nazionali; in quelli di una città c'è già "di qui / da fuori"
      setCityLine(r.city && poll.scope === "national" ? { name: r.city.name, pct: r.city.pct } : null);
      setJustVoted(true);
      setChanging(false);
      onVoted?.();
    } catch (e) {
      setNote(errMsg(e));
    } finally {
      setBusy(null);
    }
  }

  async function share() {
    const r = await shareLink({ title: "Pulse", text: `Tu cosa ne pensi? "${poll.title}"`, path: `/q/${poll.id}` });
    if (r === "copied") {
      setNote("Link copiato.");
      setTimeout(() => setNote(""), 2500);
    }
  }

  const actions: Action[] = [{ label: "Condividi il sondaggio", icon: <Share2 size={19} />, onSelect: share }];
  if (poll.is_author) {
    actions.push({
      label: "Elimina il sondaggio",
      icon: <Trash2 size={19} />,
      danger: true,
      confirm: { question: "Eliminare il sondaggio?", detail: "Spariscono anche i voti e la foto. Non si può annullare.", yes: "Elimina" },
      onSelect: async () => {
        try {
          await api.deletePoll(poll.id);
          onDeleted?.();
        } catch (e) {
          setNote(errMsg(e));
        }
      },
    });
  } else {
    actions.push({
      label: poll.reported ? "Già segnalato" : "Segnala",
      icon: <Flag size={19} />,
      disabled: poll.reported,
      onSelect: () => (me ? setReporting(true) : requireAuth("Entra per segnalare un contenuto")),
    });
  }
  if (me?.is_admin && !poll.is_author) {
    actions.push({
      label: "Elimina (admin)",
      icon: <Trash2 size={19} />,
      danger: true,
      confirm: { question: "Eliminare come amministratore?", detail: "Il sondaggio sparisce per tutti, con voti e foto.", yes: "Elimina" },
      onSelect: async () => {
        try {
          await api.adminContent("question", poll.id, "remove");
          onDeleted?.();
        } catch (e) {
          setNote(errMsg(e));
        }
      },
    });
  }

  const shownPct = poll.results?.pct ?? null;
  const winner =
    ended && shownPct
      ? [...STANCES].sort((a, b) => shownPct[b.key] - shownPct[a.key])[0]
      : null;
  const tie = winner && shownPct ? STANCES.filter((s) => shownPct[s.key] === shownPct[winner.key]).length > 1 : false;

  return (
    <article className={`card p-5 ${poll.today ? "today-card" : ""}`} data-testid="poll">
      {poll.today && (
        <p className="-mt-0.5 mb-4 flex items-center gap-2 text-[11.5px] font-bold uppercase tracking-[0.09em] text-pulse" data-testid="today">
          <Sun size={14} strokeWidth={2.4} /> Domanda del giorno
          <span className="font-semibold normal-case tracking-normal text-zinc-500">
            · {poll.today.local && poll.city ? `per ${poll.city}` : "per tutta Italia"}
          </span>
        </p>
      )}
      <header className="flex items-center gap-2.5">
        {poll.author ? (
          <>
            <AuthorAvatar nickname={poll.author.nickname} name={poll.author.name} avatar={poll.author.avatar} size={32} />
            <div className="min-w-0 flex-1 leading-tight">
              <AuthorName nickname={poll.author.nickname} name={poll.author.name} small />
              <p className="text-xs text-zinc-500">ha chiesto {timeAgo(poll.created_at)}</p>
            </div>
          </>
        ) : (
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <span className="h-8 w-8 rounded-full bg-raised" />
            <p className="text-xs leading-tight text-zinc-400">
              <span className="block text-sm font-bold text-zinc-300">Account eliminato</span>
              {timeAgo(poll.created_at)}
            </p>
          </div>
        )}
        <button onClick={() => setMenu(true)} aria-label="Altre azioni" className="-mr-1.5 rounded-full p-1.5 text-zinc-500 hover:bg-white/10 hover:text-white">
          <MoreHorizontal size={20} />
        </button>
      </header>

      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs font-semibold">
        <span className="text-pulse">{poll.category}</span>
        <span className="inline-flex items-center gap-1 text-zinc-400">
          <MapPin size={12} /> {poll.scope === "local" ? poll.city : "Tutta Italia"}
        </span>
        {poll.divisive && (
          <span className="inline-flex items-center gap-1 rounded-full bg-no/15 px-2.5 py-1 text-no" title="Favorevoli e contrari quasi alla pari">
            <Flame size={12} /> Fa discutere
          </span>
        )}
        {poll.scope === "local" && poll.audience === "local" && poll.city && <LocalOnly city={poll.city} />}
        {left && (
          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 ${ended ? "bg-white/[0.07] text-zinc-400" : left.urgent ? "bg-no/15 text-no" : "bg-maybe/15 text-maybe"}`}>
            <Clock size={12} /> {left.text}
          </span>
        )}
      </div>

      <h3 className="mt-2.5 font-display text-[1.35rem] font-bold leading-[1.2] tracking-[-0.02em] text-zinc-50">{poll.title}</h3>
      {poll.description && (
        <div className="mt-2">
          <p className={`whitespace-pre-wrap break-words text-sm leading-6 text-zinc-400 ${!expanded ? "line-clamp-3" : ""}`}>{poll.description}</p>
          {!expanded && poll.description.length > 160 && (
            <button onClick={() => setExpanded(true)} className="text-sm font-semibold text-zinc-300 hover:text-white">
              Leggi tutto
            </button>
          )}
        </div>
      )}

      {poll.image && (
        <button onClick={() => setPhoto(true)} aria-label="Apri la foto del sondaggio" className="mt-4 block w-full overflow-hidden rounded-2xl bg-zinc-900">
          <img src={poll.image.sm} alt="" loading="lazy" className="aspect-[16/10] w-full object-cover" />
        </button>
      )}

      <div className="mt-5">
        {showResults ? (
          <>
            {winner && (
              <p className="mb-3 text-sm font-semibold text-zinc-200">
                {tie ? "Finita in parità." : <>Com'è finita: hanno vinto i <span className={winner.text}>{winner.plural.toLowerCase()}</span>.</>}
              </p>
            )}
            {shownPct ? (
              <Polso pct={shownPct} mine={poll.my_vote} animate={justVoted} />
            ) : (
              <div>
                <Polso pct={null} size="sm" />
                <p className="mt-2.5 text-sm text-zinc-300">
                  {ended ? "Troppi pochi voti per mostrare il risultato." : "Voto registrato."}{" "}
                  <span className="text-zinc-500">
                    Le percentuali compaiono quando votano abbastanza persone: così nessuno può capire come ha votato un altro.
                  </span>
                </p>
              </div>
            )}
            {cityLine && (
              <p className="mt-3 rounded-xl bg-white/[0.05] px-3 py-2 text-xs text-zinc-300">
                A {cityLine.name}: {cityLine.pct.yes}% favorevoli, {cityLine.pct.depends}% dipende, {cityLine.pct.no}% contrari
              </p>
            )}
            {poll.results!.local && <LocalResults split={poll.results!.local} city={poll.city ?? ""} mine={poll.my_resident} />}
            {outsider && !ended && (
              <div className="mt-4 flex items-center justify-between gap-3 rounded-xl border border-line bg-raised px-3.5 py-3">
                <span className="text-[13px] leading-5 text-zinc-400">Votano solo le persone di {poll.city}.</span>
                <button onClick={() => setDeclaring(true)} className="shrink-0 rounded-full bg-pulse px-3.5 py-1.5 text-xs font-bold text-ink">
                  Sono di {poll.city}
                </button>
              </div>
            )}
            {shownPct && poll.results!.low_sample && !ended && (
              <p className="mt-3 text-xs text-zinc-500">Pochi voti finora: le percentuali cambieranno.</p>
            )}
          </>
        ) : asking !== null ? (
          <div className="rise rounded-2xl bg-white/[0.05] p-4">
            <p className="text-sm font-semibold text-zinc-100">Questo sondaggio è per {poll.city}. Tu voti come…</p>
            <div className="mt-3 grid gap-2">
              <button onClick={() => vote(asking, true)} className="rounded-xl bg-zinc-50 px-4 py-3 text-sm font-bold text-ink hover:bg-white">
                Sono di {poll.city}
              </button>
              <button onClick={() => vote(asking, false)} className="rounded-xl border border-line bg-raised px-4 py-3 text-sm font-bold hover:border-zinc-600">
                Vengo da fuori
              </button>
            </div>
            <p className="mt-3 text-xs leading-5 text-zinc-500">
              Il tuo voto resta segreto. Chi è di {poll.city} e chi viene da fuori si contano a parte. «Sono di {poll.city}» lo ricordiamo
              per tutti i suoi sondaggi: puoi toglierlo dalle Impostazioni.
            </p>
            <button onClick={() => setAsking(null)} className="mt-2 text-xs font-semibold text-zinc-400 hover:text-white">Annulla</button>
          </div>
        ) : canVote || !me ? (
          <>
            {poll.scope === "local" && (
              <p className="mb-3 text-xs text-zinc-400">
                {localMe
                  ? `Voti come persona di ${poll.city}.`
                  : poll.audience === "local"
                    ? `Votano solo le persone di ${poll.city}.`
                    : `Sondaggio per ${poll.city}: puoi votare anche da fuori, conti a parte.`}
              </p>
            )}
            <div className="grid grid-cols-3 gap-2">
              {STANCES.map((s) => (
                <button
                  key={s.v}
                  disabled={busy !== null || (Boolean(me) && !canVote)}
                  onClick={() => vote(s.v)}
                  className={`group flex h-[3.75rem] flex-col items-center justify-center gap-1.5 rounded-xl border border-line bg-raised px-1 text-[14px] font-bold text-zinc-100 transition hover:border-zinc-500 hover:bg-white/[0.06] active:scale-[0.97] disabled:opacity-60 ${busy === s.v ? "pop" : ""} ${changing && poll.my_vote === s.v ? `ring-2 ${s.ring}` : ""}`}
                >
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${s.bg}`} />
                  {s.label}
                </button>
              ))}
            </div>
            <div className="mt-4">
              <Polso pct={null} size="sm" />
              <p className="mt-2 text-xs text-zinc-500">
                {poll.participants === 0 ? "Nessuno ha ancora votato: inizia tu." : "Vota per vedere come la pensano."}
              </p>
            </div>
          </>
        ) : (
          <p className="text-sm text-zinc-400">Sondaggio concluso.</p>
        )}
      </div>

      <Reasons poll={poll} onChange={(a) => setPoll((p) => ({ ...p, arguments: a }))} />

      <footer className="-mx-2 mt-4 flex items-center justify-between border-t border-line px-2 pt-2.5 text-xs text-zinc-500">
        <span className="inline-flex items-center gap-1.5">
          <Users size={14} /> {people(poll.participants)}
        </span>
        <span className="flex items-center gap-1">
          {showResults && canVote && (
            <button onClick={() => setChanging(true)} className="inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 font-semibold hover:bg-white/5 hover:text-white">
              <RotateCcw size={13} /> Cambia voto
            </button>
          )}
          <button onClick={share} className="inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 font-semibold hover:bg-white/5 hover:text-white">
            <Share2 size={13} /> Condividi
          </button>
        </span>
      </footer>
      {note && <p className="mt-2 text-sm text-zinc-300">{note}</p>}

      {menu && <ActionSheet title="Sondaggio" actions={actions} onClose={() => setMenu(false)} />}
      {declaring && poll.city && (
        <DeclareCity
          city={poll.city}
          onClose={() => setDeclaring(false)}
          onDone={async () => {
            setDeclaring(false);
            try {
              setPoll(await api.poll(poll.id)); // ora posso votare
            } catch {
              /* resta com'è */
            }
          }}
        />
      )}
      {photo && poll.image && <Lightbox images={[poll.image]} caption={poll.title} onClose={() => setPhoto(false)} />}
      {reporting && (
        <ReportDialog
          targetType="question"
          target={poll.id}
          onClose={() => setReporting(false)}
          onDone={(hidden) => {
            setReporting(false);
            setPoll((p) => ({ ...p, reported: true }));
            setNote(hidden ? "Grazie: il sondaggio è stato nascosto." : "Grazie, segnalazione inviata.");
          }}
        />
      )}
    </article>
  );
}

/** Sondaggio di una città: come hanno votato quelli di lì e quelli di fuori, separati. */
function LocalResults({ split, city, mine }: { split: LocalSplit; city: string; mine: boolean | null }) {
  const row = (label: string, g: LocalSplit["residents"], me: boolean) => (
    <div>
      <p className="mb-1.5 flex items-baseline justify-between text-xs">
        <span className="font-semibold text-zinc-200">
          {label}
          {me && <span className="ml-1.5 rounded-md bg-white/10 px-1.5 py-px text-[11px] font-bold">tu</span>}
        </span>
        <span className="tabular text-zinc-400">{g.total === 1 ? "1 voto" : `${g.total} voti`}</span>
      </p>
      {g.pct ? (
        <div className="flex items-center gap-2.5">
          <div className="flex-1"><Polso pct={g.pct} size="sm" legend={false} animate={false} /></div>
          <span className="tabular w-24 shrink-0 text-right text-[11px] text-zinc-400">
            <span className="text-yes">{g.pct.yes}</span> · <span className="text-maybe">{g.pct.depends}</span> · <span className="text-no">{g.pct.no}</span> %
          </span>
        </div>
      ) : (
        <p className="text-[11px] text-zinc-500">{g.total === 0 ? "Ancora nessuno." : "Ancora pochi voti per mostrare come hanno votato."}</p>
      )}
    </div>
  );
  return (
    <div className="mt-4 space-y-3 rounded-2xl bg-white/[0.04] p-3.5">
      {row(`Chi è di ${city}`, split.residents, mine === true)}
      {row("Da fuori", split.outside, mine === false)}
      <p className="text-[11px] text-zinc-500">Di {city} o di fuori lo dichiara chi vota.</p>
    </div>
  );
}

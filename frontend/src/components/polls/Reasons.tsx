import { useEffect, useState } from "react";
import { Flag, Plus, ThumbsUp, Trash2 } from "lucide-react";
import { api, errMsg } from "../../api";
import type { Argument, ArgumentSummary, Poll } from "../../types";
import { useNav } from "../../nav";
import { confirmDialog } from "../../confirm";
import ReportDialog from "../social/ReportDialog";
import Sheet from "../social/Sheet";

type Side = "yes" | "no";
const MIN = 10;
const MAX = 200;

const SIDE = {
  yes: { title: "Perché sì", dot: "bg-yes", text: "text-yes", ring: "border-yes/60 bg-yes/[0.08]" },
  no: { title: "Perché no", dot: "bg-no", text: "text-no", ring: "border-no/60 bg-no/[0.08]" },
} as const;

/**
 * Le ragioni sotto un sondaggio: la più utile per il sì e per il no, affiancate.
 * Senza nomi (chi scrive non rivela come vota). Tocca per leggerle tutte o aggiungere la tua.
 */
export default function Reasons({ poll, onChange }: { poll: Poll; onChange: (s: ArgumentSummary) => void }) {
  const { me, requireAuth } = useNav();
  const [open, setOpen] = useState<null | { write: Side | null }>(null);
  const s = poll.arguments;
  if (!s) return null;
  const total = s.yes + s.no;
  if (total === 0 && !s.can_add && me) return null; // concluso senza ragioni: niente da mostrare

  const write = (side: Side | null) => {
    if (!me) {
      requireAuth("Entra per aggiungere una ragione");
      return;
    }
    setOpen({ write: side });
  };

  return (
    <section className="mt-5" data-testid="reasons">
      {total === 0 ? (
        <button
          onClick={() => write(null)}
          className="flex w-full items-center justify-between gap-3 rounded-2xl border border-dashed border-line px-4 py-3 text-left transition hover:border-zinc-600 hover:bg-white/[0.03]"
        >
          <span className="min-w-0">
            <span className="block text-[13.5px] font-semibold text-zinc-200">Perché sì o perché no?</span>
            <span className="block text-xs text-zinc-500">Aiuta gli altri a decidere con una ragione, senza nome.</span>
          </span>
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white/[0.07] px-3 py-1.5 text-xs font-bold text-zinc-100">
            <Plus size={13} /> Aggiungi
          </span>
        </button>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            {(["yes", "no"] as const).map((side) => {
              const top = side === "yes" ? s.top_yes : s.top_no;
              return (
                <button
                  key={side}
                  onClick={() => (top ? setOpen({ write: null }) : write(side))}
                  className="flex min-h-[7.25rem] flex-col rounded-2xl bg-white/[0.04] p-3.5 text-left transition hover:bg-white/[0.07]"
                >
                  <span className={`flex items-center gap-1.5 text-[11.5px] font-bold uppercase tracking-[0.06em] ${SIDE[side].text}`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${SIDE[side].dot}`} /> {SIDE[side].title}
                  </span>
                  {top ? (
                    <>
                      <span className="mt-2 line-clamp-4 flex-1 break-words text-[13px] leading-[1.45] text-zinc-200">{top.body}</span>
                      {top.useful > 0 && (
                        <span className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-zinc-500">
                          <ThumbsUp size={11} /> Utile per {top.useful}
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="mt-2 flex-1 text-[13px] leading-[1.45] text-zinc-500">
                      {s.can_add || !me ? "Ancora nessuna. Scrivi la prima." : "Nessuna ragione."}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex items-center justify-between gap-2 px-1">
            <button onClick={() => setOpen({ write: null })} className="text-xs font-semibold text-zinc-400 hover:text-white">
              {total === 1 ? "Leggi la ragione" : `Tutte le ragioni (${total})`}
            </button>
            {(s.can_add || !me) && (
              <button onClick={() => write(null)} className="inline-flex items-center gap-1 text-xs font-bold text-zinc-200 hover:text-white">
                <Plus size={13} /> Aggiungi la tua
              </button>
            )}
          </div>
        </>
      )}
      {open && <ReasonsSheet poll={poll} start={open.write} onClose={() => setOpen(null)} onChange={onChange} />}
    </section>
  );
}

/** Tutte le ragioni, divise per lato, con "Utile" e il modulo per scrivere la propria. */
function ReasonsSheet({
  poll,
  start,
  onClose,
  onChange,
}: {
  poll: Poll;
  start: Side | null;
  onClose: () => void;
  onChange: (s: ArgumentSummary) => void;
}) {
  const { me } = useNav();
  const [lists, setLists] = useState<{ yes: Argument[]; no: Argument[] } | null>(null);
  const [error, setError] = useState("");
  const [side, setSide] = useState<Side | null>(start);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [reporting, setReporting] = useState<Argument | null>(null);
  const [tab, setTab] = useState<Side>(start ?? "yes");
  const canAdd = Boolean(me) && Boolean(poll.arguments?.can_add);

  useEffect(() => {
    api.arguments(poll.id).then(setLists).catch((e) => setError(errMsg(e)));
  }, [poll.id]);

  // tiene allineato il riepilogo della card
  function sync(next: { yes: Argument[]; no: Argument[] }) {
    setLists(next);
    const vis = (l: Argument[]) => l.filter((a) => !a.hidden);
    onChange({
      yes: vis(next.yes).length,
      no: vis(next.no).length,
      top_yes: vis(next.yes)[0] ?? null,
      top_no: vis(next.no)[0] ?? null,
      can_add: poll.arguments?.can_add ?? false,
    });
  }

  const order = (l: Argument[]) => [...l].sort((a, b) => b.useful - a.useful || a.id - b.id);
  const mineOn = (sd: Side) => lists?.[sd].some((a) => a.mine) ?? false;

  async function publish() {
    if (!side || !lists) return;
    setBusy(true);
    setError("");
    try {
      const a = await api.addArgument(poll.id, side, text);
      sync({ ...lists, [side]: order([...lists[side], a]) });
      setText("");
      setTab(side);
      setSide(null);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  async function toggleUseful(a: Argument) {
    if (!lists) return;
    try {
      const r = await api.usefulArgument(a.id, !a.voted);
      const sd = a.side;
      sync({ ...lists, [sd]: order(lists[sd].map((x) => (x.id === a.id ? r : x))) });
    } catch (e) {
      setError(errMsg(e));
    }
  }

  async function remove(a: Argument) {
    if (!lists) return;
    const ok = await confirmDialog({
      title: "Eliminare la tua ragione?",
      detail: "Sparisce anche chi l'aveva trovata utile. Poi potrai scriverne un'altra.",
      yes: "Elimina",
      danger: true,
    });
    if (!ok) return;
    try {
      await api.deleteArgument(a.id);
      sync({ ...lists, [a.side]: lists[a.side].filter((x) => x.id !== a.id) });
    } catch (e) {
      setError(errMsg(e));
    }
  }

  const len = text.trim().replace(/\s+/g, " ").length;
  const list = lists ? lists[tab] : [];

  return (
    <Sheet title="Le ragioni" onClose={onClose} tall>
      <p className="-mt-1 line-clamp-2 text-sm font-semibold text-zinc-300">{poll.title}</p>

      {canAdd && mineOn("yes") && mineOn("no") && (
        <p className="mt-4 rounded-2xl bg-white/[0.04] px-3.5 py-3 text-xs leading-5 text-zinc-400">
          Hai scritto una ragione per lato. Per cambiarne una, eliminala e scrivine un'altra.
        </p>
      )}
      {canAdd && !(mineOn("yes") && mineOn("no")) && (
        <div className="mt-4 rounded-2xl border border-line bg-raised p-3.5">
          <p className="text-[13px] font-semibold text-zinc-200">La tua ragione</p>
          <div className="mt-2.5 grid grid-cols-2 gap-2">
            {(["yes", "no"] as const).map((sd) => (
              <button
                key={sd}
                disabled={mineOn(sd)}
                onClick={() => setSide(sd)}
                aria-pressed={side === sd}
                className={`flex items-center justify-center gap-2 rounded-xl border px-3 py-2.5 text-sm font-bold transition disabled:opacity-40 ${side === sd ? SIDE[sd].ring + " text-zinc-50" : "border-line text-zinc-300 hover:border-zinc-600"}`}
              >
                <span className={`h-2 w-2 rounded-full ${SIDE[sd].dot}`} /> {SIDE[sd].title}
              </button>
            ))}
          </div>
          {side && (
            <div className="rise mt-2.5">
              <textarea
                autoFocus
                value={text}
                onChange={(e) => setText(e.target.value.slice(0, MAX + 20))}
                rows={3}
                maxLength={MAX + 20}
                placeholder={side === "yes" ? "Es. Più ombra d'estate e aria più pulita." : "Es. Costa troppo rispetto ad altre priorità."}
                className="w-full resize-none rounded-xl border border-line bg-ink px-3.5 py-3 text-[14.5px] leading-6 text-zinc-100 placeholder:text-zinc-600 focus:border-zinc-500 focus:outline-none"
              />
              <div className="mt-2 flex items-center justify-between gap-3">
                <span className={`tabular text-xs ${len > MAX ? "text-no" : "text-zinc-500"}`}>
                  {len}/{MAX} · senza nome e senza link
                </span>
                <button
                  disabled={busy || len < MIN || len > MAX}
                  onClick={publish}
                  className="rounded-full bg-pulse px-4 py-2 text-sm font-bold text-ink transition hover:brightness-110 disabled:bg-white/10 disabled:text-zinc-500"
                >
                  {busy ? "Un attimo…" : "Pubblica"}
                </button>
              </div>
            </div>
          )}
          {!side && (mineOn("yes") || mineOn("no")) && (
            <p className="mt-2.5 text-xs leading-5 text-zinc-500">Una ragione per lato: ti resta l'altro.</p>
          )}
        </div>
      )}

      {error && <p role="alert" className="mt-3 rounded-xl bg-no/10 px-3 py-2 text-sm text-no">{error}</p>}

      <div className="mt-5 flex border-b border-line" role="tablist">
        {(["yes", "no"] as const).map((sd) => (
          <button
            key={sd}
            role="tab"
            aria-selected={tab === sd}
            onClick={() => setTab(sd)}
            className={`relative flex-1 pb-2.5 text-sm font-bold transition ${tab === sd ? "text-zinc-50" : "text-zinc-500 hover:text-zinc-300"}`}
          >
            {SIDE[sd].title}
            <span className="ml-1.5 tabular text-xs font-semibold text-zinc-500">{lists ? lists[sd].filter((a) => !a.hidden || a.mine).length : ""}</span>
            {tab === sd && <span className={`absolute inset-x-6 -bottom-px h-0.5 rounded-full ${SIDE[sd].dot}`} />}
          </button>
        ))}
      </div>

      <div className="mt-3 space-y-2 pb-2">
        {lists === null && !error && <p className="py-6 text-center text-sm text-zinc-500">Carico le ragioni…</p>}
        {lists && list.length === 0 && (
          <p className="py-8 text-center text-sm text-zinc-500">
            Ancora nessuna ragione per il {tab === "yes" ? "sì" : "no"}.
          </p>
        )}
        {list.map((a) => (
          <div key={a.id} className="rounded-2xl bg-white/[0.04] p-3.5" data-testid="reason">
            {(a.mine || a.hidden) && (
              <p className="mb-1.5 flex flex-wrap gap-1.5 text-[11px] font-bold">
                {a.mine && <span className="rounded-md bg-white/10 px-1.5 py-px text-zinc-200">La tua</span>}
                {a.hidden && <span className="rounded-md bg-no/15 px-1.5 py-px text-no">Nascosta dopo le segnalazioni</span>}
              </p>
            )}
            <p className="whitespace-pre-wrap break-words text-[14px] leading-6 text-zinc-100">{a.body}</p>
            <div className="mt-2.5 flex items-center justify-between">
              {a.mine ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-500">
                  <ThumbsUp size={13} /> {a.useful === 0 ? "Nessuno l'ha ancora segnata utile" : a.useful === 1 ? "Utile per 1 persona" : `Utile per ${a.useful} persone`}
                </span>
              ) : (
                <button
                  disabled={!me}
                  onClick={() => toggleUseful(a)}
                  aria-pressed={a.voted}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold transition ${a.voted ? "border-zinc-50 bg-zinc-50 text-ink" : "border-line text-zinc-300 hover:border-zinc-500"} disabled:opacity-60`}
                >
                  <ThumbsUp size={13} /> Utile{a.useful > 0 ? ` · ${a.useful}` : ""}
                </button>
              )}
              {a.mine ? (
                <button onClick={() => remove(a)} aria-label="Elimina la tua ragione" className="rounded-full p-1.5 text-zinc-500 hover:bg-white/10 hover:text-no">
                  <Trash2 size={15} />
                </button>
              ) : (
                me && (
                  <button onClick={() => setReporting(a)} aria-label="Segnala la ragione" className="rounded-full p-1.5 text-zinc-600 hover:bg-white/10 hover:text-zinc-300">
                    <Flag size={14} />
                  </button>
                )
              )}
            </div>
          </div>
        ))}
      </div>
      <p className="pb-1 text-center text-[11px] leading-5 text-zinc-600">
        Le ragioni non mostrano chi le ha scritte. Le più utili salgono in cima.
      </p>

      {reporting && (
        <ReportDialog
          targetType="argument"
          target={reporting.id}
          onClose={() => setReporting(null)}
          onDone={(hidden) => {
            const r = reporting;
            setReporting(null);
            if (hidden && lists) sync({ ...lists, [r.side]: lists[r.side].filter((x) => x.id !== r.id) });
          }}
        />
      )}
    </Sheet>
  );
}

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, LayoutList, Plus, Rows3 } from "lucide-react";
import { api, errMsg } from "../../api";
import type { Me, Poll } from "../../types";
import { useNav } from "../../nav";
import PollCard from "./PollCard";
import { ExamplesCarousel } from "./Examples";

type Status = "open" | "ended";
interface Filter {
  status?: Status | "all";
  author?: string;
  city?: string;
  following?: boolean;
}

function usePolls(status?: Status | "all", author?: string, city?: string, following?: boolean) {
  const [items, setItems] = useState<Poll[] | null>(null);
  const [next, setNext] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [more, setMore] = useState(false);

  useEffect(() => {
    setItems(null);
    setError("");
    api
      .polls({ status, author, city, following })
      .then((r) => {
        setItems(r.items);
        setNext(r.next);
      })
      .catch((e) => setError(errMsg(e)));
  }, [status, author, city, following]);

  const loadMore = useCallback(async () => {
    if (!next || more) return;
    setMore(true);
    try {
      const r = await api.polls({ status, author, city, following, before: next });
      setItems((p) => [...(p ?? []), ...r.items.filter((x) => !(p ?? []).some((y) => y.id === x.id))]);
      setNext(r.next);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setMore(false);
    }
  }, [next, more, status, author, city, following]);

  const remove = (id: number) => setItems((all) => all?.filter((x) => x.id !== id) ?? null);
  return { items, next, error, more, loadMore, remove };
}

/** Tutti i sondaggi, uno sotto l'altro (profili e vista "Elenco"). */
export function PollList({ status, author, city, following, empty }: Filter & { empty: string }) {
  const { items, next, error, more, loadMore, remove } = usePolls(status, author, city, following);
  if (error) return <p role="alert" className="rounded-xl bg-no/10 px-3 py-2 text-sm text-no">{error}</p>;
  if (items === null) return <p className="py-12 text-center text-sm text-zinc-500">Carico i sondaggi…</p>;
  if (items.length === 0) return <p className="card px-6 py-8 text-center text-sm leading-6 text-zinc-400">{empty}</p>;
  return (
    <div className="space-y-4">
      {items.map((p) => (
        <PollCard key={p.id} poll={p} onDeleted={() => remove(p.id)} />
      ))}
      {next && (
        <button onClick={loadMore} disabled={more} className="w-full rounded-2xl py-3 text-sm font-semibold text-zinc-400 ring-1 ring-white/10 hover:text-white disabled:opacity-50">
          {more ? "Carico…" : "Altri sondaggi"}
        </button>
      )}
    </div>
  );
}

/** Sondaggi da scorrere con il dito, uno alla volta: il prossimo si intravede sul bordo. */
function PollPager({ status, onCreate, onVoted }: { status: Status; onCreate: () => void; onVoted: () => void }) {
  const { items, next, error, loadMore, remove } = usePolls(status);
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);

  const slideWidth = () => {
    const el = track.current?.firstElementChild as HTMLElement | null;
    return el ? el.offsetWidth + 12 : 1; // 12 = spazio tra le card
  };

  function onScroll() {
    const el = track.current;
    if (!el || !items) return;
    const i = Math.round(el.scrollLeft / slideWidth());
    setIndex(i);
    if (next && i >= items.length - 3) void loadMore(); // quasi alla fine: carica i successivi
  }

  function go(delta: number) {
    track.current?.scrollBy({ left: delta * slideWidth(), behavior: "smooth" });
  }

  // frecce della tastiera (computer)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t && ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName)) return;
      if (document.querySelector('[role="dialog"]')) return;
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (error) return <p role="alert" className="rounded-xl bg-no/10 px-3 py-2 text-sm text-no">{error}</p>;
  if (items === null) return <p className="py-12 text-center text-sm text-zinc-500">Carico i sondaggi…</p>;
  if (items.length === 0) {
    return (
      <div className="card px-6 py-8 text-center">
        <p className="font-display text-lg font-bold text-zinc-50">{status === "open" ? "Nessun sondaggio aperto" : "Nessun sondaggio concluso"}</p>
        <p className="mx-auto mt-1.5 max-w-xs text-sm leading-6 text-zinc-400">
          {status === "open" ? "Fai tu la prima domanda: la vedono subito tutti." : "Qui trovi i sondaggi finiti, con il risultato."}
        </p>
        {status === "open" && (
          <button onClick={onCreate} className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-pulse px-5 py-2.5 text-sm font-bold text-ink hover:brightness-110">
            <Plus size={16} strokeWidth={2.6} /> Crea un sondaggio
          </button>
        )}
      </div>
    );
  }

  const total = items.length + (next ? 1 : 0);
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <p className="tabular text-sm text-zinc-400">
          <span className="font-semibold text-zinc-100">{Math.min(index + 1, items.length)}</span> di {next ? `${items.length}+` : items.length}
        </p>
        <div className="flex gap-1.5">
          <button onClick={() => go(-1)} disabled={index === 0} aria-label="Sondaggio precedente" className="rounded-full border border-line p-2 text-zinc-200 transition hover:border-zinc-600 disabled:opacity-30">
            <ChevronLeft size={18} />
          </button>
          <button onClick={() => go(1)} disabled={index >= total} aria-label="Sondaggio successivo" className="rounded-full border border-line p-2 text-zinc-200 transition hover:border-zinc-600 disabled:opacity-30">
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      <div
        ref={track}
        onScroll={onScroll}
        data-testid="pager"
        className="-mx-4 flex snap-x snap-mandatory items-start gap-3 overflow-x-auto scroll-smooth px-4 pb-2 no-scrollbar"
      >
        {items.map((p) => (
          <div key={p.id} className="w-[88%] shrink-0 snap-center">
            <PollCard poll={p} onDeleted={() => remove(p.id)} onVoted={onVoted} />
          </div>
        ))}
        <div className="card flex w-[88%] shrink-0 snap-center flex-col items-center justify-center self-stretch p-8 text-center">
          <p className="font-display text-xl font-bold">{next ? "Ne carico altri…" : "Hai visto tutto."}</p>
          <p className="mt-2 text-sm leading-6 text-zinc-400">Manca una domanda? Creala tu: la vedono subito tutti.</p>
          <button onClick={onCreate} className="mt-5 inline-flex items-center gap-1.5 rounded-full bg-pulse px-5 py-2.5 text-sm font-bold text-ink hover:brightness-110">
            <Plus size={16} strokeWidth={2.6} /> Crea un sondaggio
          </button>
        </div>
      </div>

      {/* puntini: dove sei */}
      <div className="mt-2 flex justify-center gap-1.5" aria-hidden>
        {items.slice(0, 12).map((p, i) => (
          <span key={p.id} className={`h-1.5 rounded-full transition-all ${i === index ? "w-5 bg-zinc-100" : "w-1.5 bg-white/20"}`} />
        ))}
      </div>
      {index === 0 && items.length > 1 && <p className="mt-3 text-center text-xs text-zinc-500">Scorri a sinistra per il prossimo</p>}
    </div>
  );
}

export default function PollsTab({ me, onCreate, onAnswered }: { me: Me | null; onCreate: () => void; onAnswered: () => void }) {
  const { requireAuth } = useNav();
  const [view, setView] = useState<"pager" | "list">("pager");
  const [status, setStatus] = useState<Status>("open");
  const create = () => (me ? onCreate() : requireAuth("Entra per creare un sondaggio"));

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 pt-1">
        <div>
          <h1 className="font-display text-[1.9rem] font-extrabold leading-none tracking-[-0.035em]">Sondaggi</h1>
          <p className="mt-2 text-[13.5px] leading-5 text-zinc-400">Rispondi con un tocco e scopri come la pensano gli altri.</p>
        </div>
        <button onClick={create} aria-label="Crea un sondaggio" className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-pulse px-3.5 text-[13px] font-bold text-ink transition hover:brightness-110">
          <Plus size={15} strokeWidth={2.6} /> Crea
        </button>
      </div>

      <div className="flex items-center gap-2">
        {(["open", "ended"] as const).map((s) => (
          <button
            key={s}
            aria-pressed={status === s}
            onClick={() => setStatus(s)}
            className={`flex h-9 items-center rounded-full px-4 text-[13.5px] font-semibold transition ${status === s ? "bg-zinc-50 text-ink" : "border border-line text-zinc-300 hover:border-zinc-600 hover:text-white"}`}
          >
            {s === "open" ? "Aperti" : "Conclusi"}
          </button>
        ))}
        <div className="ml-auto flex rounded-full border border-line p-0.5" role="tablist" aria-label="Vista">
          <button role="tab" aria-selected={view === "pager"} aria-label="Scorri" onClick={() => setView("pager")} className={`rounded-full p-1.5 ${view === "pager" ? "bg-zinc-100 text-ink" : "text-zinc-400"}`}>
            <Rows3 size={16} className="rotate-90" />
          </button>
          <button role="tab" aria-selected={view === "list"} aria-label="Elenco" onClick={() => setView("list")} className={`rounded-full p-1.5 ${view === "list" ? "bg-zinc-100 text-ink" : "text-zinc-400"}`}>
            <LayoutList size={16} />
          </button>
        </div>
      </div>

      {view === "pager" ? (
        <PollPager key={status} status={status} onCreate={create} onVoted={onAnswered} />
      ) : (
        <PollList status={status} empty={status === "open" ? "Nessun sondaggio aperto: creane uno tu." : "Nessun sondaggio concluso, per ora."} />
      )}

      <div className="pt-4">
        <ExamplesCarousel
          title="Idee per un sondaggio"
          action={
            <button onClick={create} className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-pulse px-3.5 py-2 text-[13px] font-bold text-ink transition hover:brightness-110">
              <Plus size={15} strokeWidth={2.6} /> Crea il tuo
            </button>
          }
        />
      </div>
    </div>
  );
}

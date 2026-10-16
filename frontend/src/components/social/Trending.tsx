import { useEffect, useState } from "react";
import { BarChart3, Lightbulb, MessageCircle, TrendingUp } from "lucide-react";
import { api } from "../../api";
import type { Trending as TrendingData, TrendingItem } from "../../types";
import { useNav } from "../../nav";
import Polso from "../polls/Polso";

type Where = "city" | "italy";

/**
 * In evidenza: i 3 contenuti che hanno coinvolto più persone negli ultimi 7 giorni.
 * Nel Pulse: «La tua città | Italia». Dentro una città: solo quella città.
 * Se non c'è niente da mostrare, non compare.
 */
export default function Trending({ fixedCity, excludeId }: { fixedCity?: string; excludeId?: number | null }) {
  const { me, openPost, openPoll } = useNav();
  const myCity = me?.city ?? null;
  const [data, setData] = useState<Record<Where, TrendingData | null>>({ city: null, italy: null });
  const [where, setWhere] = useState<Where>(fixedCity || myCity ? "city" : "italy");
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let alive = true;
    setReady(false);
    const city = fixedCity ?? myCity;
    Promise.all([
      city ? api.trending("city", city, excludeId).catch(() => null) : Promise.resolve(null),
      fixedCity ? Promise.resolve(null) : api.trending("italy", null, excludeId).catch(() => null),
    ]).then(([c, i]) => {
      if (!alive) return;
      setData({ city: c, italy: i });
      // la tua città prima; se lì questa settimana non c'è ancora niente, si parte dall'Italia
      setWhere(c?.items.length || fixedCity ? "city" : "italy");
      setReady(true);
    });
    return () => {
      alive = false;
    };
  }, [fixedCity, myCity, excludeId]);

  const cityItems = data.city?.items ?? [];
  const italyItems = data.italy?.items ?? [];
  if (!ready || (cityItems.length === 0 && italyItems.length === 0)) return null;
  const items = where === "city" ? cityItems : italyItems;
  const cityName = fixedCity ?? myCity;
  const toggle = !fixedCity && Boolean(myCity);

  return (
    <section className="card p-5" data-testid="trending">
      <div className="flex items-center justify-between gap-3">
        <p className="flex items-center gap-2 text-[11.5px] font-bold uppercase tracking-[0.09em] text-pulse">
          <TrendingUp size={15} strokeWidth={2.4} />
          {fixedCity ? `In evidenza a ${fixedCity}` : "In evidenza"}
        </p>
        {toggle && (
          <div className="flex rounded-full border border-line p-0.5 text-xs font-semibold" role="tablist" aria-label="Dove">
            {(["city", "italy"] as const).map((w) => (
              <button
                key={w}
                role="tab"
                aria-selected={where === w}
                onClick={() => setWhere(w)}
                className={`max-w-[9rem] truncate rounded-full px-3 py-1 transition ${where === w ? "bg-zinc-50 text-ink" : "text-zinc-400 hover:text-zinc-100"}`}
              >
                {w === "city" ? cityName : "Italia"}
              </button>
            ))}
          </div>
        )}
      </div>
      <p className="mt-1 text-xs text-zinc-500">Questa settimana, per persone coinvolte</p>

      {items.length === 0 ? (
        <p className="mt-4 rounded-xl bg-white/[0.04] px-3.5 py-3 text-sm text-zinc-400">
          A {cityName} questa settimana non c'è ancora niente in evidenza.
        </p>
      ) : (
        <ol className="mt-3 divide-y divide-line">
          {items.map((it, i) => (
            <li key={`${it.type}${it.id}`}>
              <Row item={it} rank={i + 1} onOpen={() => (it.type === "poll" ? openPoll(it.id) : openPost(it.id))} />
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function Row({ item, rank, onOpen }: { item: TrendingItem; rank: number; onOpen: () => void }) {
  const poll = item.type === "poll" ? item : null;
  const post = item.type === "post" ? item : null;
  const proposal = post?.kind === "proposal";
  const title = poll ? poll.title : proposal && post?.headline ? post.headline : post?.body ?? "";
  const label = poll ? "Sondaggio" : proposal ? "Proposta" : "Post";
  const Icon = poll ? BarChart3 : proposal ? Lightbulb : MessageCircle;
  const place = item.scope === "local" && item.city ? item.city : "Tutta Italia";

  return (
    <button onClick={onOpen} className="-mx-2 flex w-[calc(100%+1rem)] items-start gap-3 rounded-xl px-2 py-3.5 text-left transition hover:bg-white/[0.03]">
      <span className="w-5 shrink-0 pt-0.5 text-center font-display text-xl font-bold leading-none text-zinc-600 tabular">{rank}</span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-[11.5px] font-semibold text-zinc-500">
          <Icon size={12} /> {label} · {place}
        </span>
        <span className="mt-1 line-clamp-2 break-words text-[14.5px] font-semibold leading-snug text-zinc-100">{title}</span>
        {poll &&
          (poll.results?.pct ? (
            <span className="mt-2 flex items-center gap-2.5">
              <span className="flex-1"><Polso pct={poll.results.pct} size="sm" legend={false} animate={false} /></span>
              <span className="shrink-0 text-[11px] font-semibold text-zinc-400 tabular">
                <span className="text-yes">{poll.results.pct.yes}%</span> favorevoli
              </span>
            </span>
          ) : (
            <span className="mt-1.5 block text-xs text-zinc-500">{poll.results ? "Ancora pochi voti per mostrare le percentuali" : "Vota per vedere i risultati"}</span>
          ))}
        {proposal && post?.goal && (
          <span className="mt-2 flex items-center gap-2.5">
            <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
              <span className="block h-full rounded-full bg-pulse" style={{ width: `${Math.min(100, (post.supports / post.goal) * 100)}%` }} />
            </span>
            <span className="shrink-0 text-[11px] font-semibold text-zinc-400 tabular">{post.supports} su {post.goal}</span>
          </span>
        )}
      </span>
      <span className="shrink-0 pt-0.5 text-right leading-none">
        <span className="block font-display text-lg font-bold text-zinc-50 tabular">{item.week_people}</span>
        <span className="mt-1 block text-[10.5px] font-semibold text-zinc-500">persone</span>
      </span>
    </button>
  );
}

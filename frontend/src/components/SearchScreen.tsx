import { useEffect, useRef, useState, type ReactNode } from "react";
import { Clock, Search, X } from "lucide-react";
import { api, errMsg } from "../api";
import type { PersonCard } from "../types";
import { useNav } from "../nav";
import Avatar from "./social/Avatar";
import FollowButton from "./social/FollowButton";
import Sheet from "./social/Sheet";

const RECENT_KEY = "pulse.recentSearch";
type Recent = { nickname: string; name: string | null; avatar: string | null };

function readRecent(): Recent[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || "[]").slice(0, 6);
  } catch {
    return [];
  }
}
function saveRecent(list: Recent[]) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 6)));
  } catch {
    /* navigazione privata: pazienza */
  }
}

const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Evidenzia l'inizio delle parole che corrispondono a quello che si sta scrivendo. */
function Highlight({ text, query }: { text: string; query: string }) {
  const terms = fold(query).split(/[^a-z0-9]+/).filter((t) => t.length >= 2);
  if (!terms.length) return <>{text}</>;
  const parts: ReactNode[] = [];
  text.split(/(\s+|[._@-])/).forEach((w, i) => {
    const f = fold(w);
    const t = terms.find((x) => f.startsWith(x));
    if (t) {
      parts.push(
        <span key={i}>
          <span className="text-pulse">{w.slice(0, t.length)}</span>
          {w.slice(t.length)}
        </span>,
      );
    } else parts.push(<span key={i}>{w}</span>);
  });
  return <>{parts}</>;
}

/** Cerca le persone iscritte (per nome o nome utente, anche solo le prime lettere), mentre scrivi. */
export default function SearchScreen({ onClose }: { onClose: () => void }) {
  const { openProfile } = useNav();
  const [q, setQ] = useState("");
  const [people, setPeople] = useState<PersonCard[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [recent, setRecent] = useState<Recent[]>(readRecent);
  const seq = useRef(0);
  const term = q.trim().replace(/^@/, "");

  // ricerca mentre si scrive (con una piccola pausa per non chiedere a ogni lettera)
  useEffect(() => {
    if (term.length < 2) {
      setPeople(null);
      setLoading(false);
      return;
    }
    const n = ++seq.current;
    setLoading(true);
    const t = window.setTimeout(() => {
      api
        .searchUsers(term)
        .then((r) => n === seq.current && (setPeople(r), setError("")))
        .catch((e) => n === seq.current && setError(errMsg(e)))
        .finally(() => n === seq.current && setLoading(false));
    }, 180);
    return () => window.clearTimeout(t);
  }, [term]);

  function goPerson(p: Recent) {
    const next = [p, ...recent.filter((r) => r.nickname !== p.nickname)];
    setRecent(next);
    saveRecent(next);
    onClose();
    openProfile(p.nickname);
  }

  const row = "flex w-full items-center gap-3 rounded-2xl px-2 py-2.5 text-left transition hover:bg-white/[0.05]";

  return (
    <Sheet title="Cerca" onClose={onClose} tall>
      <div className="sticky top-0 z-10 -mx-5 bg-panel px-5 pb-3 pt-1">
        <label className="flex items-center gap-2.5 rounded-2xl bg-white/[0.06] px-4 ring-1 ring-white/[0.08] focus-within:ring-pulse/60">
          <Search size={19} className="shrink-0 text-zinc-400" />
          <input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Cerca persone per nome o nome utente"
            aria-label="Cerca persone"
            autoCapitalize="none"
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="search"
            className="min-w-0 flex-1 bg-transparent py-3.5 text-[16px] outline-none placeholder:text-zinc-500"
          />
          {loading && <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-white/15 border-t-pulse" aria-label="Cerco" />}
          {q && !loading && (
            <button onClick={() => setQ("")} aria-label="Cancella" className="shrink-0 rounded-full bg-white/10 p-1 text-zinc-300 hover:bg-white/20">
              <X size={14} />
            </button>
          )}
        </label>
      </div>

      {term.length < 2 ? (
        recent.length > 0 ? (
          <section>
            <div className="mb-1 flex items-center justify-between px-2">
              <h3 className="text-sm font-semibold text-zinc-400">Recenti</h3>
              <button onClick={() => { setRecent([]); saveRecent([]); }} className="text-xs font-semibold text-zinc-500 hover:text-white">
                Cancella
              </button>
            </div>
            <ul>
              {recent.map((p) => (
                <li key={p.nickname}>
                  <button onClick={() => goPerson(p)} className={row}>
                    <Avatar name={p.name ?? p.nickname} src={p.avatar} size={40} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold">{p.name ?? `@${p.nickname}`}</span>
                      {p.name && <span className="block truncate text-xs text-zinc-500">@{p.nickname}</span>}
                    </span>
                    <Clock size={15} className="text-zinc-600" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <div className="px-4 py-14 text-center">
            <Search size={30} className="mx-auto text-zinc-600" />
            <p className="mt-3 font-display text-lg font-bold">Trova le persone</p>
            <p className="mx-auto mt-1 max-w-xs text-sm leading-6 text-zinc-400">Scrivi le prime lettere di un nome o di un nome utente.</p>
          </div>
        )
      ) : (
        <div className="space-y-5">
          {error && <p className="rounded-xl bg-no/10 px-3 py-2 text-sm text-no">{error}</p>}

          {people && people.length > 0 && (
            <section>
              <ul>
                {people.map((p) => (
                  <li key={p.nickname} className="flex items-center gap-2">
                    <button onClick={() => goPerson(p)} className={`${row} min-w-0 flex-1`}>
                      <Avatar name={p.name ?? p.nickname} src={p.avatar} size={44} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] font-semibold">
                          <Highlight text={p.name ?? `@${p.nickname}`} query={term} />
                        </span>
                        {p.name && (
                          <span className="block truncate text-xs text-zinc-500">
                            @<Highlight text={p.nickname} query={term} />
                          </span>
                        )}
                      </span>
                    </button>
                    {p.relation && (
                      <FollowButton
                        compact
                        nickname={p.nickname}
                        relation={p.relation}
                        onChange={(prof) => setPeople((all) => all?.map((x) => (x.nickname === p.nickname ? { ...x, relation: prof.relation } : x)) ?? null)}
                      />
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}


          {!loading && people !== null && people.length === 0 && (
            <p className="px-4 py-10 text-center text-sm text-zinc-400">Nessuna persona per «{term}».</p>
          )}
        </div>
      )}
    </Sheet>
  );
}

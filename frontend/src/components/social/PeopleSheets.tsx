import { useEffect, useRef, useState } from "react";
import { Search, UserX, X } from "lucide-react";
import { api, errMsg } from "../../api";
import { confirmDialog } from "../../confirm";
import type { PersonCard } from "../../types";
import { useNav } from "../../nav";
import Avatar from "./Avatar";
import FollowButton from "./FollowButton";
import Sheet from "./Sheet";

function PersonRow({
  p,
  onOpen,
  action,
}: {
  p: PersonCard;
  onOpen: () => void;
  action?: React.ReactNode;
}) {
  return (
    <li className="flex items-center gap-3 py-2.5">
      <button onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <Avatar name={p.name ?? p.nickname} src={p.avatar} size={44} />
        <span className="min-w-0">
          <span className="block truncate text-sm font-bold">{p.name ?? `@${p.nickname}`}</span>
          {p.name && <span className="block truncate text-xs text-zinc-500">@{p.nickname}</span>}
        </span>
      </button>
      {action}
    </li>
  );
}

/** I tuoi follower o seguiti (li vedi solo tu), con ricerca mentre scrivi. */
export function PeopleSheet({
  nickname,
  kind,
  isMe,
  onClose,
  onChanged,
}: {
  nickname: string;
  kind: "followers" | "following";
  isMe: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { openProfile } = useNav();
  const [items, setItems] = useState<PersonCard[] | null>(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);
  const term = q.trim().replace(/^@/, "");

  useEffect(() => {
    const n = ++seq.current;
    setLoading(true);
    const t = window.setTimeout(
      () => {
        api
          .people(nickname, kind, term.length >= 2 ? term : "")
          .then((r) => n === seq.current && (setItems(r.items), setError("")))
          .catch((e) => n === seq.current && setError(errMsg(e)))
          .finally(() => n === seq.current && setLoading(false));
      },
      term ? 180 : 0,
    );
    return () => window.clearTimeout(t);
  }, [nickname, kind, term]);

  async function removeFollower(nick: string) {
    if (!(await confirmDialog({ title: `Togliere @${nick} dai follower?`, detail: "Non ti seguirà più e non vedrà i tuoi post tra i Seguiti. Non riceve nessun avviso.", yes: "Togli", danger: true }))) return;
    try {
      await api.removeFollower(nick);
      setItems((all) => all?.filter((p) => p.nickname !== nick) ?? null);
      onChanged();
    } catch (e) {
      setError(errMsg(e));
    }
  }

  return (
    <Sheet title={kind === "followers" ? "I tuoi follower" : "Chi segui"} onClose={onClose} tall>
      <div className="sticky top-0 z-10 -mx-5 bg-panel px-5 pb-2 pt-1">
        <label className="flex items-center gap-2.5 rounded-2xl bg-white/[0.06] px-4 ring-1 ring-white/[0.08] focus-within:ring-pulse/60">
          <Search size={17} className="shrink-0 text-zinc-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={kind === "followers" ? "Cerca tra i tuoi follower" : "Cerca tra chi segui"}
            aria-label={kind === "followers" ? "Cerca tra i tuoi follower" : "Cerca tra chi segui"}
            autoCapitalize="none"
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="search"
            className="min-w-0 flex-1 bg-transparent py-3 text-[16px] outline-none placeholder:text-zinc-500"
          />
          {loading && items !== null && <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-white/15 border-t-pulse" aria-label="Cerco" />}
          {q && !loading && (
            <button onClick={() => setQ("")} aria-label="Cancella" className="shrink-0 rounded-full bg-white/10 p-1 text-zinc-300 hover:bg-white/20">
              <X size={14} />
            </button>
          )}
        </label>
        <p className="mt-2 px-1 text-[11px] text-zinc-500">Questo elenco lo vedi solo tu.</p>
      </div>
      {error && <p className="text-sm text-no">{error}</p>}
      {items === null && !error && <p className="py-8 text-center text-sm text-zinc-500">Carico…</p>}
      {items?.length === 0 && !loading && (
        <p className="py-8 text-center text-sm text-zinc-500">
          {term.length >= 2
            ? `Nessuno per «${term}».`
            : kind === "followers" ? "Ancora nessun follower." : "Non segui ancora nessuno."}
        </p>
      )}
      <ul className="divide-y divide-white/5">
        {items?.map((p) => (
          <PersonRow
            key={p.nickname}
            p={p}
            onOpen={() => {
              onClose();
              openProfile(p.nickname);
            }}
            action={
              isMe && kind === "followers" ? (
                <button onClick={() => removeFollower(p.nickname)} className="flex items-center gap-1 rounded-full border border-white/15 px-3 py-1.5 text-xs font-bold text-zinc-300 hover:bg-white/5">
                  <UserX size={14} /> Rimuovi
                </button>
              ) : p.relation ? (
                <FollowButton
                  compact
                  nickname={p.nickname}
                  relation={p.relation}
                  onChange={(prof) => {
                    setItems((all) => all?.map((x) => (x.nickname === p.nickname ? { ...x, relation: prof.relation } : x)) ?? null);
                    onChanged();
                  }}
                />
              ) : null
            }
          />
        ))}
      </ul>
    </Sheet>
  );
}

/** Richieste di chi vuole seguirti: Accetta / Rifiuta. */
export function RequestsSheet({ onClose, onChanged }: { onClose: () => void; onChanged: (pending: number) => void }) {
  const { openProfile } = useNav();
  const [items, setItems] = useState<PersonCard[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.requests().then(setItems).catch((e) => setError(errMsg(e)));
  }, []);

  async function answer(nick: string, action: "accept" | "decline") {
    try {
      const r = await api.answerRequest(nick, action);
      setItems((all) => all?.filter((p) => p.nickname !== nick) ?? null);
      onChanged(r.pending_requests);
    } catch (e) {
      setError(errMsg(e));
    }
  }

  return (
    <Sheet title="Richieste di follow" onClose={onClose}>
      {error && <p className="text-sm text-no">{error}</p>}
      {items === null && !error && <p className="py-8 text-center text-sm text-zinc-500">Carico…</p>}
      {items?.length === 0 && <p className="py-8 text-center text-sm text-zinc-500">Nessuna richiesta in attesa.</p>}
      <ul className="divide-y divide-white/5">
        {items?.map((p) => (
          <PersonRow
            key={p.nickname}
            p={p}
            onOpen={() => {
              onClose();
              openProfile(p.nickname);
            }}
            action={
              <span className="flex gap-2">
                <button onClick={() => answer(p.nickname, "accept")} className="rounded-full bg-pulse px-3.5 py-1.5 text-xs font-extrabold text-ink hover:brightness-110">
                  Accetta
                </button>
                <button onClick={() => answer(p.nickname, "decline")} className="rounded-full border border-white/15 px-3.5 py-1.5 text-xs font-bold text-zinc-300 hover:bg-white/5">
                  Rifiuta
                </button>
              </span>
            }
          />
        ))}
      </ul>
    </Sheet>
  );
}

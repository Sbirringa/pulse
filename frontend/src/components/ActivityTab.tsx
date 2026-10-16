import { useEffect, useState, type ReactNode } from "react";
import { BarChart3, Check, Lightbulb, MessageCircle, Reply, UserPlus, X } from "lucide-react";
import { api, errMsg } from "../api";
import type { Me, NotificationItem, PersonCard } from "../types";
import { timeAgo } from "../timeAgo";
import { useNav } from "../nav";
import Avatar from "./social/Avatar";
import Polso from "./polls/Polso";

const who = (p: PersonCard | null) => (p ? p.name ?? `@${p.nickname}` : "Qualcuno");

/** Notifiche: chi ti segue, chi commenta, chi risponde, sondaggi conclusi. Le richieste di follow stanno in cima. */
export default function ActivityTab({ onSeen, onMeChange }: { onSeen: () => void; onMeChange: (m: Partial<Me>) => void }) {
  const { openPost, openProfile, openPoll } = useNav();
  const [items, setItems] = useState<NotificationItem[] | null>(null);
  const [next, setNext] = useState<number | null>(null);
  const [requests, setRequests] = useState<PersonCard[]>([]);
  const [followed, setFollowed] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([api.notifications(null), api.requests()])
      .then(([n, r]) => {
        setItems(n.items);
        setNext(n.next);
        setRequests(r);
        // le hai viste: il pallino rosso sparisce (qui restano evidenziate le nuove)
        if (n.items.some((x) => !x.read)) void api.markRead().then(onSeen);
        else onSeen();
      })
      .catch((e) => setError(errMsg(e)));
  }, [onSeen]);

  async function more() {
    if (!next) return;
    const n = await api.notifications(next);
    setItems((all) => [...(all ?? []), ...n.items]);
    setNext(n.next);
  }

  async function answer(nick: string, action: "accept" | "decline") {
    try {
      const r = await api.answerRequest(nick, action);
      setRequests((all) => all.filter((p) => p.nickname !== nick));
      onMeChange({ pending_requests: r.pending_requests });
      if (action === "accept") {
        const n = await api.notifications(null);
        setItems(n.items);
      }
    } catch (e) {
      setError(errMsg(e));
    }
  }

  async function followBack(nick: string) {
    try {
      await api.follow(nick);
      setFollowed((s) => new Set(s).add(nick));
    } catch (e) {
      setError(errMsg(e));
    }
  }

  function open(n: NotificationItem) {
    if ((n.kind === "comment" || n.kind === "reply") && n.post_id) openPost(n.post_id);
    else if ((n.kind === "poll_ended" || n.kind === "proposal_poll") && n.question_id) openPoll(n.question_id);
    else if (n.actor) openProfile(n.actor.nickname);
  }

  function sentence(n: NotificationItem): ReactNode {
    const name = <strong className="font-bold text-zinc-50">{who(n.actor)}</strong>;
    switch (n.kind) {
      case "follow":
        return <>{name} ha iniziato a seguirti</>;
      case "follow_request":
        return <>{name} ha chiesto di seguirti</>;
      case "follow_accepted":
        return <>{name} ha accettato la tua richiesta: ora vedi i suoi post tra i Seguiti</>;
      case "comment":
        return <>{name} ha commentato il tuo post: <span className="text-zinc-300">“{n.text}”</span></>;
      case "reply":
        return <>{name} ti ha risposto: <span className="text-zinc-300">“{n.text}”</span></>;
      case "poll_ended":
        return (
          <>
            {n.poll?.mine ? "Il tuo sondaggio è concluso" : "Un sondaggio a cui hai risposto è concluso"}:{" "}
            <strong className="font-bold text-zinc-50">{n.text}</strong>
          </>
        );
      case "proposal_poll":
        return (
          <>
            {n.mine ? "La tua proposta ha raggiunto i sostenitori" : "Una proposta che sostieni ha raggiunto i sostenitori"}: ora è un
            sondaggio, vai a votare. <strong className="font-bold text-zinc-50">{n.text}</strong>
          </>
        );
    }
  }

  const badge: Record<NotificationItem["kind"], ReactNode> = {
    follow: <UserPlus size={11} />,
    follow_request: <UserPlus size={11} />,
    follow_accepted: <Check size={11} />,
    comment: <MessageCircle size={11} />,
    reply: <Reply size={11} />,
    poll_ended: <BarChart3 size={11} />,
    proposal_poll: <Lightbulb size={11} />,
  };

  // le richieste ancora da decidere sono già in cima, con Accetta e Rifiuta: niente doppioni sotto
  const waiting = new Set(requests.map((p) => p.nickname));
  const shown = items?.filter((n) => !(n.kind === "follow_request" && n.actor && waiting.has(n.actor.nickname))) ?? [];
  const fresh = shown.filter((n) => !n.read);
  const old = shown.filter((n) => n.read);

  const row = (n: NotificationItem) => (
    <li key={n.id}>
      <div className={`flex gap-3 px-4 py-3.5 transition hover:bg-white/[0.03] ${!n.read ? "bg-pulse/[0.035]" : ""}`}>
        <button onClick={() => open(n)} className="relative h-11 w-11 shrink-0" aria-label="Apri">
          {n.kind === "poll_ended" || n.kind === "proposal_poll" ? (
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-raised text-pulse">
              <BarChart3 size={20} />
            </span>
          ) : (
            <Avatar name={n.actor ? n.actor.name ?? n.actor.nickname : null} src={n.actor?.avatar} size={44} />
          )}
          <span className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-pulse text-ink ring-2 ring-ink">
            {badge[n.kind]}
          </span>
        </button>
        <div className="min-w-0 flex-1">
          <button onClick={() => open(n)} className="block w-full text-left text-sm leading-5 text-zinc-400">
            <span className="line-clamp-3">{sentence(n)}</span>
            <span className="mt-0.5 block text-xs text-zinc-500">{timeAgo(n.created_at)}</span>
          </button>
          {n.kind === "poll_ended" && n.poll && n.poll.pct && (
            <div className="mt-2.5">
              <Polso pct={n.poll.pct} size="sm" animate={false} />
            </div>
          )}
          {n.kind === "follow" && n.actor && !n.following_back && (
            <button
              disabled={followed.has(n.actor.nickname)}
              onClick={() => followBack(n.actor!.nickname)}
              className="mt-2.5 rounded-full bg-zinc-50 px-3.5 py-1.5 text-xs font-bold text-ink transition hover:bg-white disabled:bg-white/10 disabled:text-zinc-400"
            >
              {followed.has(n.actor.nickname) ? "Fatto" : "Segui anche tu"}
            </button>
          )}
        </div>
        {!n.read && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-pulse" aria-label="Nuova" />}
      </div>
    </li>
  );

  return (
    <div className="space-y-5">
      <div className="pt-1">
        <h1 className="font-display text-[1.9rem] font-extrabold leading-none tracking-[-0.035em]">Attività</h1>
        <p className="mt-2 text-[13.5px] leading-5 text-zinc-400">Chi ti segue, chi ti risponde e i sondaggi che si chiudono.</p>
      </div>

      {requests.length > 0 && (
        <section className="card p-4">
          <h2 className="mb-1 px-1 font-display text-base font-bold">
            {requests.length === 1 ? "1 richiesta di follow" : `${requests.length} richieste di follow`}
          </h2>
          <ul>
            {requests.map((p) => (
              <li key={p.nickname} className="flex items-center gap-3 px-1 py-2.5">
                <button onClick={() => openProfile(p.nickname)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                  <Avatar name={p.name ?? p.nickname} src={p.avatar} size={40} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold">{p.name ?? `@${p.nickname}`}</span>
                    {p.name && <span className="block truncate text-xs text-zinc-500">@{p.nickname}</span>}
                  </span>
                </button>
                <button onClick={() => answer(p.nickname, "accept")} className="rounded-full bg-pulse px-3.5 py-2 text-xs font-bold text-ink hover:brightness-110">
                  Accetta
                </button>
                <button onClick={() => answer(p.nickname, "decline")} aria-label={`Rifiuta ${p.nickname}`} className="rounded-full border border-line p-2 text-zinc-300 transition hover:border-zinc-600 hover:text-white">
                  <X size={16} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {error && <p role="alert" className="rounded-xl bg-no/10 px-3 py-2 text-sm text-no">{error}</p>}
      {items === null && !error && <p className="py-12 text-center text-sm text-zinc-500">Carico le notifiche…</p>}

      {items?.length === 0 && requests.length === 0 && (
        <div className="px-4 py-12 text-center">
          <p className="font-display text-xl font-bold">Ancora niente qui.</p>
          <p className="mx-auto mt-2 max-w-xs text-sm leading-6 text-zinc-400">
            Quando qualcuno ti segue, commenta un tuo post o si chiude un sondaggio a cui hai risposto, lo trovi qui.
          </p>
        </div>
      )}

      {fresh.length > 0 && (
        <section>
          <h2 className="mb-2 px-1 text-[13px] font-semibold text-zinc-500">Nuove</h2>
          <ul className="card divide-y divide-line overflow-hidden">{fresh.map(row)}</ul>
        </section>
      )}
      {old.length > 0 && (
        <section>
          {fresh.length > 0 && <h2 className="mb-2 px-1 text-[13px] font-semibold text-zinc-500">Prima</h2>}
          <ul className="card divide-y divide-line overflow-hidden">{old.map(row)}</ul>
        </section>
      )}
      {next && (
        <button onClick={more} className="w-full rounded-2xl border border-line py-3 text-sm font-semibold text-zinc-400 transition hover:border-zinc-600 hover:text-white">
          Notifiche precedenti
        </button>
      )}
    </div>
  );
}

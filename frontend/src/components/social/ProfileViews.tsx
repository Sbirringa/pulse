import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ArrowLeft, ChevronRight, Flag, Lock, MoreHorizontal, Pencil, Radar, UserX } from "lucide-react";
import { api, errMsg } from "../../api";
import ActionSheet from "../ActionSheet";
import type { Me, Post, Profile } from "../../types";
import { useNav } from "../../nav";
import Avatar from "./Avatar";
import AvatarPicker from "./AvatarPicker";
import EditProfileSheet from "./EditProfileSheet";
import FollowButton from "./FollowButton";
import { PeopleSheet, RequestsSheet } from "./PeopleSheets";
import PostCard from "./PostCard";
import ReportDialog from "./ReportDialog";
import AdminPanel from "../AdminPanel";
import { PollList } from "../polls/PollsTab";

function Count({ n, label, onClick }: { n: number; label: string; onClick?: () => void }) {
  return (
    <button onClick={onClick} disabled={!onClick} className="flex flex-col items-center py-3 transition enabled:hover:bg-white/[0.04]">
      <span className="font-display text-[1.3rem] font-bold leading-none text-zinc-50 tabular-nums">{n}</span>
      <span className="mt-1.5 text-xs font-medium text-zinc-500">{label}</span>
    </button>
  );
}

const persone = (n: number) => (n === 1 ? "1 persona" : `${n.toLocaleString("it-IT")} persone`);

/**
 * Persone coinvolte: quante persone diverse hanno risposto ai post o votato i sondaggi (ognuna una volta).
 * Si mostra solo ciò che c'è: niente zeri, niente medie. In più, il contenuto che ha coinvolto di più.
 */
function Reach({ counts, isMe }: { counts: HeaderProps["counts"]; isMe?: boolean }) {
  const { openPoll, openPost } = useNav();
  if (counts.reached === 0) {
    return isMe ? (
      <div className="card mt-3 flex w-full items-start gap-3.5 p-4 text-left" data-testid="reach">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-pulse/[0.12] text-pulse"><Radar size={20} /></span>
        <span>
          <span className="block text-sm font-semibold text-zinc-100">Ancora nessuna persona coinvolta</span>
          <span className="mt-0.5 block text-[13px] leading-5 text-zinc-500">
            Pubblica un post o un sondaggio: chi ti risponde o vota comparirà qui, ognuno una volta sola.
          </span>
        </span>
      </div>
    ) : (
      <p className="mt-4 text-center text-xs text-zinc-500" data-testid="reach">Non ha ancora coinvolto nessuno.</p>
    );
  }
  const parts = [
    counts.reached_polls > 0 && `${counts.reached_polls.toLocaleString("it-IT")} con i sondaggi`,
    counts.reached_posts > 0 && `${counts.reached_posts.toLocaleString("it-IT")} con i post`,
  ].filter(Boolean);
  const top = counts.top;
  return (
    <div className="card mt-3 w-full p-5 text-left" data-testid="reach">
      <p className="flex items-baseline gap-2.5">
        <span className="font-display text-[2.4rem] font-extrabold leading-none tracking-[-0.03em] text-pulse tabular">{counts.reached.toLocaleString("it-IT")}</span>
        <span className="text-[15px] font-semibold text-zinc-100">{counts.reached === 1 ? "persona coinvolta" : "persone coinvolte"}</span>
      </p>
      {/* i due canali solo se ci sono entrambi: con uno solo sarebbe una ripetizione del numero grande */}
      {parts.length === 2 && <p className="mt-1 text-xs text-zinc-400">{parts.join(" · ")}</p>}
      {counts.reached_recent > 0 && counts.reached_recent < counts.reached && (
        <p className="mt-0.5 text-xs text-zinc-500">{persone(counts.reached_recent)} nell'ultimo mese</p>
      )}
      {top && (
        <button
          onClick={() => (top.type === "poll" ? openPoll(top.id) : openPost(top.id))}
          className="mt-4 flex w-full items-center gap-3 rounded-xl border border-line bg-raised px-3.5 py-3 text-left transition hover:border-zinc-600"
        >
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] font-semibold text-zinc-500">
              {top.type === "poll" ? "Il sondaggio più seguito" : "Il post più seguito"}
            </span>
            <span className="mt-0.5 line-clamp-2 block text-sm font-semibold leading-5 text-zinc-100">{top.text}</span>
          </span>
          <span className="shrink-0 text-right">
            <span className="block font-display text-lg font-bold leading-none text-zinc-50 tabular">{top.people}</span>
            <span className="text-[11px] text-zinc-500">persone</span>
          </span>
          <ChevronRight size={16} className="shrink-0 text-zinc-600" />
        </button>
      )}
    </div>
  );
}

type HeaderProps = Parameters<typeof Header>[0];

function Header({
  avatar,
  name,
  nickname,
  bio,
  counts,
  onPeople,
  actions,
  isMe = false,
  isPrivate = false,
}: {
  avatar: ReactNode;
  name: string | null;
  nickname: string;
  bio: string | null;
  counts: {
    posts: number;
    followers: number;
    following: number;
    reached: number;
    reached_recent: number;
    reached_polls: number;
    reached_posts: number;
    top: { type: "poll" | "post"; id: number; text: string; people: number } | null;
    polls: number;
  };
  isMe?: boolean;
  isPrivate?: boolean;
  /** solo nel proprio profilo: gli elenchi di follower e seguiti li vede solo il proprietario */
  onPeople?: (kind: "followers" | "following") => void;
  actions: ReactNode;
}) {
  return (
    <section className="flex flex-col items-center pt-2 text-center">
      {avatar}
      <h1 className="mt-4 font-display text-[1.75rem] font-extrabold leading-tight tracking-[-0.03em] text-zinc-50">{name ?? `@${nickname}`}</h1>
      {name && <p className="mt-0.5 text-sm text-zinc-500">@{nickname}</p>}
      {isPrivate && (
        <span className="mt-2 inline-flex items-center gap-1 rounded-full bg-white/[0.06] px-2.5 py-1 text-[11px] font-semibold text-zinc-300" data-testid="private-badge">
          <Lock size={11} /> Profilo privato
        </span>
      )}
      {bio && <p className="mt-3 max-w-sm whitespace-pre-wrap break-words text-[15px] leading-6 text-zinc-300">{bio}</p>}
      <div className="mt-5 flex w-full justify-center gap-2">{actions}</div>
      <div className="card mt-5 grid w-full grid-cols-4 divide-x divide-line overflow-hidden">
        <Count n={counts.posts} label="Post" />
        <Count n={counts.polls} label="Sondaggi" />
        <Count n={counts.followers} label="Follower" onClick={onPeople && (() => onPeople("followers"))} />
        <Count n={counts.following} label="Seguiti" onClick={onPeople && (() => onPeople("following"))} />
      </div>
      {/* la misura che conta su PULSE: quante persone ha coinvolto, non quanti follower ha */}
      <Reach counts={counts} isMe={isMe} />
    </section>
  );
}

function Segments<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="-mx-4 overflow-x-auto px-4 no-scrollbar">
      <div className="flex min-w-full border-b border-line text-[14.5px] font-semibold" role="tablist">
        {options.map(([id, label]) => (
          <button
            key={id}
            role="tab"
            aria-selected={value === id}
            onClick={() => onChange(id)}
            className={`relative flex-1 whitespace-nowrap px-3 py-3 transition ${value === id ? "text-zinc-50" : "text-zinc-500 hover:text-zinc-200"}`}
          >
            {label}
            {value === id && <span aria-hidden className="absolute inset-x-3 -bottom-px h-[3px] rounded-full bg-pulse" />}
          </button>
        ))}
      </div>
    </div>
  );
}

function PostsList({ nickname, reloadKey, empty }: { nickname: string; reloadKey: number; empty: string }) {
  const { openPost } = useNav();
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [next, setNext] = useState<number | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.userPosts(nickname, null).then((r) => { setPosts(r.items); setNext(r.next); }).catch((e) => setError(errMsg(e)));
  }, [nickname, reloadKey]);

  async function more() {
    if (!next) return;
    const r = await api.userPosts(nickname, next);
    setPosts((p) => [...(p ?? []), ...r.items]);
    setNext(r.next);
  }

  if (error) return <p className="text-sm text-no">{error}</p>;
  if (posts === null) return <p className="py-8 text-center text-sm text-zinc-500">Carico i post…</p>;
  if (posts.length === 0) return <p className="py-8 text-center text-sm text-zinc-500">{empty}</p>;
  return (
    <div className="space-y-5">
      {posts.map((p) => (
        <PostCard
          key={p.id}
          post={p}
          onOpen={() => openPost(p.id)}
          onDeleted={() => setPosts((all) => all?.filter((x) => x.id !== p.id) ?? null)}
          onChanged={(np) => setPosts((all) => all?.map((x) => (x.id === np.id ? np : x)) ?? null)}
        />
      ))}
      {next && (
        <button onClick={more} className="w-full rounded-2xl border border-white/10 py-3 text-sm font-bold text-zinc-300 hover:bg-white/5">
          Carica altri post
        </button>
      )}
    </div>
  );
}

/** Profilo privato di qualcuno con cui non vi seguite a vicenda: si vede chi è, non cosa pubblica. */
function Locked({ profile }: { profile: Profile }) {
  const r = profile.relation;
  const who = profile.name ?? `@${profile.nickname}`;
  const hint =
    r.following === "pending"
      ? `Richiesta inviata. Quando ${who} la accetta e segue anche te, vedrai post e sondaggi.`
      : r.following === "accepted"
        ? `Lo segui già: vedrai post e sondaggi quando anche ${who} seguirà te.`
        : r.follows_you
          ? `${who} ti segue: seguilo anche tu e, quando accetta, vedrai post e sondaggi.`
          : `Post e sondaggi li vede solo chi si segue a vicenda con ${who}.`;
  return (
    <div className="rise rounded-[1.5rem] border border-dashed border-white/15 px-6 py-10 text-center" data-testid="locked-profile">
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-white/[0.06] text-zinc-300">
        <Lock size={22} />
      </span>
      <p className="mt-4 font-display text-lg font-bold">Questo profilo è privato</p>
      <p className="mx-auto mt-1.5 max-w-xs text-sm leading-6 text-zinc-400">{hint}</p>
    </div>
  );
}

/** Profilo di un'altra persona. */
export function UserProfileView({ nickname, onBack }: { nickname: string; onBack: () => void }) {
  const { me, requireAuth } = useNav();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState("");
  const [menu, setMenu] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [note, setNote] = useState("");
  const [view, setView] = useState<"posts" | "polls">("posts");

  const load = useCallback(() => {
    api.profile(nickname).then(setProfile).catch((e) => setError(errMsg(e)));
  }, [nickname]);

  useEffect(() => {
    window.scrollTo(0, 0);
    load();
  }, [load]);

  // tornando sull'app (o sulla scheda) i numeri si aggiornano da soli: follower e seguiti sempre giusti
  useEffect(() => {
    const onFocus = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);

  async function answer(action: "accept" | "decline") {
    try {
      await api.answerRequest(nickname, action);
      load();
    } catch (e) {
      setNote(errMsg(e));
    }
  }

  async function removeFollower() {
    try {
      setProfile(await api.removeFollower(nickname));
    } catch (e) {
      setNote(errMsg(e));
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm font-semibold text-zinc-400 hover:text-white">
          <ArrowLeft size={17} /> Indietro
        </button>
        {profile && (
          <div className="relative">
            <button onClick={() => setMenu(true)} aria-label="Altre azioni" className="rounded-full p-2 text-zinc-400 hover:bg-white/10 hover:text-white">
              <MoreHorizontal size={20} />
            </button>
            {menu && (
              <ActionSheet
                title={`@${profile.nickname}`}
                onClose={() => setMenu(false)}
                actions={[
                  ...(profile.relation.follows_you
                    ? [{
                        label: "Togli dai follower",
                        icon: <UserX size={19} />,
                        confirm: {
                          question: `Togliere @${profile.nickname} dai follower?`,
                          detail: "Non ti seguirà più e non vedrà i tuoi post tra i Seguiti. Non riceve nessun avviso.",
                          yes: "Togli",
                        },
                        onSelect: removeFollower,
                      }]
                    : []),
                  {
                    label: "Segnala profilo",
                    icon: <Flag size={19} />,
                    danger: true,
                    onSelect: () => (me ? setReporting(true) : requireAuth("Entra per segnalare un profilo")),
                  },
                ]}
              />
            )}
          </div>
        )}
      </div>

      {error && <p className="rounded-xl bg-no/10 px-3 py-2 text-sm text-no">{error}</p>}
      {!profile && !error && <p className="py-10 text-center text-sm text-zinc-500">Carico il profilo…</p>}
      {profile && (
        <>
          {profile.relation.requested_you && (
            <div className="rise flex items-center justify-between gap-3 rounded-2xl border border-pulse/30 bg-pulse/10 p-3.5">
              <p className="text-sm"><strong>@{nickname}</strong> vuole seguirti</p>
              <span className="flex gap-2">
                <button onClick={() => answer("accept")} className="rounded-full bg-pulse px-3.5 py-1.5 text-xs font-extrabold text-ink">Accetta</button>
                <button onClick={() => answer("decline")} className="rounded-full border border-white/20 px-3.5 py-1.5 text-xs font-bold">Rifiuta</button>
              </span>
            </div>
          )}
          <Header
            avatar={<Avatar name={profile.name ?? profile.nickname} src={profile.avatar} size={96} />}
            name={profile.name}
            nickname={profile.nickname}
            bio={profile.bio}
            counts={profile}
            isPrivate={profile.is_private}
            actions={<FollowButton nickname={profile.nickname} relation={profile.relation} onChange={setProfile} />}
          />
          {profile.relation.follows_you && profile.relation.following === "none" && (
            <p className="-mt-2 text-center text-xs text-zinc-500">Ti segue</p>
          )}
          {note && <p className="text-center text-sm text-zinc-400">{note}</p>}
          {profile.can_see ? (
            <>
              <Segments value={view} options={[["posts", "Post"], ["polls", "Sondaggi"]]} onChange={setView} />
              {view === "posts" ? (
                <PostsList nickname={profile.nickname} reloadKey={0} empty="Nessun post per ora." />
              ) : (
                <PollList author={profile.nickname} empty="Non ha ancora creato sondaggi." />
              )}
            </>
          ) : (
            <Locked profile={profile} />
          )}
          {reporting && (
            <ReportDialog
              targetType="user"
              target={profile.nickname}
              onClose={() => setReporting(false)}
              onDone={() => { setReporting(false); setNote("Grazie, segnalazione inviata ai moderatori."); }}
            />
          )}
        </>
      )}
    </div>
  );
}

/** La mia scheda Profilo: intestazione, richieste, i miei post, Pulse e impostazioni. */
export function MyProfileTab({
  me,
  onMeChange,
  pulse,
  settings,
}: {
  me: Me;
  onMeChange: (m: Partial<Me>) => void;
  pulse: ReactNode;
  settings: ReactNode;
}) {
  const [section, setSection] = useState<"posts" | "polls" | "pulse" | "settings" | "admin">("posts");
  const [people, setPeople] = useState<"followers" | "following" | null>(null);
  const [requests, setRequests] = useState(false);
  const [editing, setEditing] = useState(false);

  const refresh = useCallback(() => {
    api.me().then(onMeChange).catch(() => undefined);
  }, [onMeChange]);

  useEffect(() => {
    refresh();
    const onFocus = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onFocus);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onFocus);
      window.removeEventListener("focus", onFocus);
    };
  }, [refresh]);

  return (
    <div className="space-y-5">
      <Header
        avatar={<AvatarPicker name={me.name ?? me.nickname} avatar={me.avatar} size={96} onChange={(avatar) => onMeChange({ avatar })} />}
        name={me.name}
        nickname={me.nickname}
        bio={me.bio}
        counts={me}
        isMe
        isPrivate={me.is_private}
        onPeople={setPeople}
        actions={
          <button onClick={() => setEditing(true)} className="inline-flex h-10 items-center gap-1.5 rounded-full border border-line px-5 text-sm font-semibold text-zinc-100 transition hover:border-zinc-600">
            <Pencil size={15} /> {me.name ? "Modifica profilo" : "Aggiungi nome e bio"}
          </button>
        }
      />

      <Segments
        value={section}
        onChange={setSection}
        options={[
          ["posts", "Post"],
          ["polls", "Sondaggi"],
          ["pulse", "Risposte"],
          ["settings", "Impostazioni"],
          ...(me.is_admin ? ([["admin", "Moderazione"]] as [typeof section, string][]) : []),
        ]}
      />

      {section === "posts" && <PostsList nickname={me.nickname} reloadKey={me.posts} empty="Non hai ancora pubblicato nulla: racconta qualcosa con il tasto +." />}
      {section === "polls" && <PollList author={me.nickname} empty="Non hai ancora creato sondaggi: tocca + e scegli Sondaggio." />}
      {section === "pulse" && pulse}
      {section === "settings" && settings}
      {section === "admin" && me.is_admin && <AdminPanel />}

      {people && <PeopleSheet nickname={me.nickname} kind={people} isMe onClose={() => setPeople(null)} onChanged={refresh} />}
      {requests && <RequestsSheet onClose={() => { setRequests(false); refresh(); }} onChanged={(n) => onMeChange({ pending_requests: n })} />}
      {editing && <EditProfileSheet me={me} onClose={() => setEditing(false)} onSaved={onMeChange} />}
    </div>
  );
}

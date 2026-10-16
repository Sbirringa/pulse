import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, BarChart3, ChevronDown, ChevronLeft, ChevronRight, ImagePlus, Map as MapIcon, MapPin, Plus } from "lucide-react";
import { api, errMsg } from "../../api";
import type { FeedItem, Me, Poll, Post } from "../../types";
import { useNav } from "../../nav";
import { useSwipe } from "../../useSwipe";
import Avatar from "./Avatar";
import Comments from "./Comments";
import { isLocal } from "./DeclareCity";
import Composer from "./Composer";
import PostCard from "./PostCard";
import PollCard from "../polls/PollCard";
import { PollList } from "../polls/PollsTab";
import { STANCES } from "../polls/Polso";
import { Ideas } from "../polls/Examples";
import ActivityMap from "../map/ActivityMap";
import CityPicker from "../map/CityPicker";

type Scope = "all" | "following" | "city";
type Kind = "all" | "posts" | "polls";

function PostDetail({
  postId,
  onBack,
  siblings,
  onSwitch,
}: {
  postId: number;
  onBack: () => void;
  siblings: number[];
  onSwitch: (id: number) => void;
}) {
  const { me } = useNav();
  const [post, setPost] = useState<Post | null>(null);
  const [error, setError] = useState("");
  const [dir, setDir] = useState<"from-right" | "from-left" | "rise">("rise");
  const at = siblings.indexOf(postId);
  const prev = at > 0 ? siblings[at - 1] : null;
  const next = at >= 0 && at < siblings.length - 1 ? siblings[at + 1] : null;

  useEffect(() => {
    window.scrollTo(0, 0);
    setError("");
    api.post(postId).then(setPost).catch((e) => setError(errMsg(e)));
  }, [postId]);

  const onCount = useCallback((n: number) => setPost((p) => (p ? { ...p, comment_count: n } : p)), []);
  const go = (id: number | null, d: "from-right" | "from-left") => {
    if (id === null) return;
    setDir(d);
    setPost(null);
    onSwitch(id);
  };
  const swipe = useSwipe({ onLeft: () => go(next, "from-right"), onRight: () => go(prev, "from-left") });

  return (
    <div {...swipe} className="min-h-[70dvh]">
      <div className="mb-4 flex items-center justify-between">
        <button onClick={onBack} className="flex items-center gap-1.5 text-sm font-semibold text-zinc-400 hover:text-white">
          <ArrowLeft size={17} /> Indietro
        </button>
        {at >= 0 && siblings.length > 1 && (
          <div className="flex items-center gap-1.5">
            <span className="tabular mr-1 text-xs text-zinc-500">{at + 1} di {siblings.length}</span>
            <button onClick={() => go(prev, "from-left")} disabled={prev === null} aria-label="Post precedente" className="rounded-full bg-white/[0.06] p-2 text-zinc-200 hover:bg-white/10 disabled:opacity-30">
              <ChevronLeft size={17} />
            </button>
            <button onClick={() => go(next, "from-right")} disabled={next === null} aria-label="Post successivo" className="rounded-full bg-white/[0.06] p-2 text-zinc-200 hover:bg-white/10 disabled:opacity-30">
              <ChevronRight size={17} />
            </button>
          </div>
        )}
      </div>
      {error && <p className="rounded-xl bg-no/10 px-3 py-2 text-sm text-no">{error}</p>}
      {!post && !error && <p className="py-10 text-center text-sm text-zinc-500">Carico il post…</p>}
      {post && (
        <div key={post.id} className={dir}>
          <PostCard post={post} full onDeleted={onBack} onChanged={setPost} />
          {post.status === "visible" ? (
            <Comments
              postId={post.id}
              onCountChange={onCount}
              localCity={post.scope === "local" && post.audience === "local" && !post.mine && !isLocal(me, post.city) ? post.city : null}
            />
          ) : (
            <p className="mt-6 text-center text-sm text-zinc-500">I commenti sono chiusi mentre il post è in revisione.</p>
          )}
          {at >= 0 && siblings.length > 1 && (
            <p className="mt-8 text-center text-xs text-zinc-500">Scorri a sinistra o a destra per passare agli altri post</p>
          )}
        </div>
      )}
    </div>
  );
}

/** Benvenuto per chi non è ancora registrato: niente muri, si guarda subito, si entra quando si vuole. */
function GuestHero() {
  const { requireAuth } = useNav();
  return (
    <section className="rise pb-2 pt-4">
      <h1 className="text-[3.1rem] font-extrabold leading-[0.95] tracking-[-0.035em]">
        Dì la tua.
        <br />
        <span className="text-zinc-400">Ascolta gli altri.</span>
      </h1>
      <p className="mt-4 max-w-sm text-[15px] leading-6 text-zinc-300">
        Racconta cosa succede dove vivi, rispondi ai sondaggi con un tocco e guarda come la pensano
        le persone, città per città.
      </p>
      <div className="mt-5 flex items-center gap-3 text-xs font-semibold text-zinc-400" aria-hidden>
        {STANCES.map((s) => (
          <span key={s.v} className="inline-flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-full ${s.bg}`} />
            {s.label}
          </span>
        ))}
      </div>
      <div className="mt-6 flex gap-2">
        <button onClick={() => requireAuth()} className="rounded-2xl bg-pulse px-5 py-3 text-sm font-bold text-ink transition hover:brightness-110 active:scale-[0.98]">
          Unisciti a PULSE
        </button>
        <button onClick={() => requireAuth(undefined, "login")} className="rounded-2xl bg-white/[0.07] px-5 py-3 text-sm font-semibold hover:bg-white/[0.12]">
          Accedi
        </button>
      </div>
    </section>
  );
}

export default function PiazzaTab({
  me,
  categories,
  openPostId,
  onOpenPost,
  onSwitchPost,
  onCreatePoll,
  focusCity,
  composeRequest,
  onComposeOpened,
  only,
  proposalGoal,
}: {
  me: Me | null;
  cities?: string[];
  categories: string[];
  openPostId: number | null;
  onOpenPost: (id: number | null) => void;
  onSwitchPost: (id: number) => void;
  onCreatePoll: () => void;
  focusCity?: { city: string; n: number } | null;
  composeRequest: boolean;
  onComposeOpened: () => void;
  /** scheda "Post" della barra in basso: solo i post */
  only?: "posts";
  proposalGoal?: number;
}) {
  const { requireAuth } = useNav();
  const [scope, setScope] = useState<Scope>("all");
  const [city, setCity] = useState<string>(me?.city ?? "");
  const [posts, setPosts] = useState<FeedItem[]>([]);
  const [next, setNext] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [writing, setWriting] = useState(false);
  const [kind, setKind] = useState<Kind>(only ?? "all");
  const [pickingCity, setPickingCity] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [error, setError] = useState("");
  // domanda del giorno: un sondaggio a cui non hai ancora risposto, in cima al Pulse
  const [today, setToday] = useState<Poll | null>(null);
  const showToday = !only && scope === "all" && kind === "all";
  useEffect(() => {
    if (!showToday || openPostId !== null) return;
    let alive = true;
    api.pollToday().then((p) => alive && setToday(p)).catch(() => alive && setToday(null));
    return () => {
      alive = false;
    };
  }, [showToday, openPostId, me?.nickname]);
  // la scelta Tutto / Post / Sondaggi vale solo dentro una città
  useEffect(() => {
    if (scope !== "city") setKind(only ?? "all");
  }, [scope, only]);

  // dalla ricerca: apri il feed di una città
  useEffect(() => {
    if (!focusCity) return;
    setCity(focusCity.city);
    setScope("city");
    setKind(only ?? "all");
  }, [focusCity]);

  // il "+" centrale chiede di scrivere un post
  useEffect(() => {
    if (composeRequest && me) {
      setWriting(true);
      onComposeOpened();
    }
  }, [composeRequest, me, onComposeOpened]);

  const load = useCallback(async (s: Scope, c: string, k: Kind) => {
    if ((s === "city" && !c) || k === "polls") {
      setPosts([]);
      setNext(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await api.posts(s, null, c, k === "posts" ? "posts" : "all");
      setPosts(data.items);
      setNext(data.next);
      setError("");
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (openPostId === null) void load(scope, city, kind);
  }, [scope, city, kind, load, openPostId]);

  async function loadMore() {
    if (!next) return;
    setMore(true);
    try {
      const data = await api.posts(scope, next, city, kind === "posts" ? "posts" : "all");
      setPosts((p) => [...p, ...data.items.filter((x) => !p.some((y) => y.type === x.type && y.id === x.id))]);
      setNext(data.next);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setMore(false);
    }
  }

  if (openPostId !== null) {
    return (
      <PostDetail
        postId={openPostId}
        onBack={() => onOpenPost(null)}
        siblings={posts.filter((p) => p.type === "post").map((p) => p.id)}
        onSwitch={onSwitchPost}
      />
    );
  }

  // idee per un sondaggio: sempre a portata di mano nel feed generale (anche quando la gente pubblica)
  const examples =
    scope === "all" && kind !== "polls" ? (
      <div key="examples">
        <Ideas
          kind={kind === "posts" ? "posts" : "mixed"}
          title={kind === "posts" ? "Idee per un post" : "Idee per iniziare"}
          action={
            <button
              onClick={() => (!me ? requireAuth("Entra per pubblicare") : kind === "posts" ? setWriting(true) : onCreatePoll())}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-pulse px-3.5 py-2 text-[13px] font-bold text-ink transition hover:brightness-110"
            >
              <Plus size={15} strokeWidth={2.6} /> {kind === "posts" ? "Scrivi il tuo" : "Crea il tuo"}
            </button>
          }
        />
      </div>
    ) : null;

  const chip = (active: boolean) =>
    `flex h-9 shrink-0 items-center gap-1.5 rounded-full px-4 text-[13.5px] font-semibold transition ${
      active ? "bg-zinc-50 text-ink" : "border border-line text-zinc-300 hover:border-zinc-600 hover:text-white"
    }`;

  return (
    <div className="space-y-4">
      {!me && <GuestHero />}

      <div className="flex items-center justify-between gap-3 pt-1">
        {me ? (
          <h1 className="font-display text-[1.9rem] font-extrabold leading-none tracking-[-0.035em]">{only === "posts" ? "Post" : "Pulse"}</h1>
        ) : (
          <h2 className="font-display text-[1.3rem] font-bold leading-tight">Cosa si dice adesso</h2>
        )}
        <button
          onClick={() => setShowMap(true)}
          aria-label="Mappa"
          title="Dove si parla adesso"
          className="flex h-9 items-center gap-1.5 rounded-full border border-line px-3.5 text-[13px] font-semibold text-zinc-300 transition hover:border-zinc-600 hover:text-white"
        >
          <MapIcon size={15} /> Mappa
        </button>
      </div>

      {/* filtri: Tutti · Seguiti · una città qualsiasi · mappa */}
      <div className="-mx-4 flex items-center gap-2 overflow-x-auto px-4 pb-1 no-scrollbar" role="tablist" aria-label="Filtra i post">
        <button role="tab" aria-selected={scope === "all"} onClick={() => setScope("all")} className={chip(scope === "all")}>
          Tutti
        </button>
        <button
          role="tab"
          aria-selected={scope === "following"}
          onClick={() => (me ? setScope("following") : requireAuth("Entra per seguire le persone e vedere i loro post"))}
          className={chip(scope === "following")}
        >
          Seguiti
        </button>
        <button
          role="tab"
          aria-selected={scope === "city"}
          aria-label={city ? `Città: ${city}` : "Scegli città"}
          onClick={() => setPickingCity(true)}
          className={chip(scope === "city")}
        >
          <MapPin size={15} />
          <span className="max-w-[9rem] truncate">{city || "Scegli città"}</span>
          <ChevronDown size={15} />
        </button>
      </div>

      {me &&
        (
          <>
            <div className="card p-3">
              <button onClick={() => setWriting(true)} className="flex w-full items-center gap-3 rounded-2xl px-1 py-1 text-left">
                <Avatar name={me.name ?? me.nickname} src={me.avatar} size={38} />
                <span className="flex-1 text-[15px] text-zinc-500">Cosa succede nella tua città?</span>
              </button>
              <div className="mt-2.5 flex gap-2 border-t border-line pt-2.5">
                <button onClick={() => setWriting(true)} className="flex flex-1 items-center justify-center gap-2 rounded-xl py-2 text-[13.5px] font-semibold text-zinc-300 transition hover:bg-white/[0.05] hover:text-white">
                  <ImagePlus size={17} className="text-pulse" /> Post con foto
                </button>
                <button onClick={onCreatePoll} className="flex flex-1 items-center justify-center gap-2 rounded-xl py-2 text-[13.5px] font-semibold text-zinc-300 transition hover:bg-white/[0.05] hover:text-white">
                  <BarChart3 size={17} className="text-maybe" /> Sondaggio
                </button>
              </div>
            </div>
            {writing && (
              <Composer
                goal={proposalGoal}
                me={me}
                categories={categories}
                onCancel={() => setWriting(false)}
                onPublished={(p) => {
                  setWriting(false);
                  setKind((k) => (k === "polls" ? "all" : k));
                  setPosts((all) => [{ ...p, type: "post" as const }, ...all]);
                }}
              />
            )}
          </>
        )}


      {/* dentro una città: post e sondaggi di quel luogo, insieme o separati */}
      {scope === "city" && city && !only && (
        <div className="flex border-b border-line text-[14.5px] font-semibold" role="tablist" aria-label={`Cosa vedere a ${city}`}>
          {([["all", "Tutto"], ["posts", "Post"], ["polls", "Sondaggi"]] as [Kind, string][]).map(([id, label]) => (
            <button
              key={id}
              role="tab"
              aria-selected={kind === id}
              onClick={() => setKind(id)}
              className={`relative flex-1 py-3 transition ${kind === id ? "text-zinc-50" : "text-zinc-500 hover:text-zinc-200"}`}
            >
              {label}
              {kind === id && <span aria-hidden className="absolute inset-x-6 -bottom-px h-[3px] rounded-full bg-pulse" />}
            </button>
          ))}
        </div>
      )}

      {kind === "polls" ? (
        scope === "city" && !city ? (
          <p className="rounded-xl bg-white/5 p-4 text-sm text-zinc-400">Scegli una città per vedere i suoi sondaggi.</p>
        ) : (
          <PollList
            key={`${scope}-${city}`}
            status="all"
            city={scope === "city" ? city : undefined}
            following={scope === "following"}
            empty={
              scope === "city"
                ? `Ancora nessun sondaggio per ${city}: creane uno tu.`
                : scope === "following"
                  ? "Le persone che segui non hanno ancora creato sondaggi."
                  : "Ancora nessun sondaggio: creane uno tu."
            }
          />
        )
      ) : (
        <>
      {scope === "city" && !city && (
        <p className="rounded-xl bg-white/5 p-4 text-sm text-zinc-400">Scegli una città per vedere cosa si dice lì.</p>
      )}
      {error && <p role="alert" className="rounded-xl bg-no/10 px-3 py-2 text-sm text-no">{error}</p>}
      {loading && <p className="py-10 text-center text-sm text-zinc-500">Carico…</p>}

      {!loading && posts.length === 0 && !error && scope === "following" && (
        <div className="card px-6 py-8 text-center">
          <p className="font-display text-lg font-bold text-zinc-50">Qui vedrai i post di chi segui</p>
          <p className="mx-auto mt-1.5 max-w-xs text-sm leading-6 text-zinc-400">Tocca il nome di qualcuno per aprire il suo profilo e seguirlo.</p>
          <button onClick={() => setScope("all")} className="mt-5 rounded-full bg-pulse px-5 py-2.5 text-sm font-bold text-ink hover:brightness-110">Guarda tutti i post</button>
        </div>
      )}
      {!loading && posts.length === 0 && !error && (scope === "all" || (scope === "city" && city)) && (
        <div className="card px-6 py-8 text-center">
          <p className="font-display text-lg font-bold text-zinc-50">{scope === "city" ? `A ${city} è ancora tutto tranquillo` : "Qui è ancora tutto tranquillo"}</p>
          <p className="mx-auto mt-1.5 max-w-xs text-sm leading-6 text-zinc-400">
            {me ? "Sii il primo: racconta cosa succede dove vivi." : "Entra e scrivi tu il primo post."}
          </p>
          {!me && (
            <button onClick={() => requireAuth()} className="mt-5 rounded-full bg-pulse px-5 py-2.5 text-sm font-bold text-ink hover:brightness-110">
              Unisciti a PULSE
            </button>
          )}
        </div>
      )}

      {showToday && today && !loading && (
        <PollCard key={`today${today.id}`} poll={today} onDeleted={() => setToday(null)} />
      )}
      {!loading && posts.length === 0 && scope === "all" && examples}
      {!loading &&
        posts.filter((p) => !(showToday && today && p.type === "poll" && p.id === today.id)).map((p, i) => [
          i === 3 && examples,
          p.type === "poll" ? (
            <PollCard key={`q${p.id}`} poll={p} onDeleted={() => setPosts((all) => all.filter((x) => !(x.type === "poll" && x.id === p.id)))} />
          ) : (
            <PostCard
              key={`p${p.id}`}
              post={p}
              onOpen={() => onOpenPost(p.id)}
              onDeleted={() => setPosts((all) => all.filter((x) => !(x.type === "post" && x.id === p.id)))}
              onChanged={(np: Post) => setPosts((all) => all.map((x) => (x.type === "post" && x.id === np.id ? { ...np, type: "post" as const } : x)))}
            />
          ),
        ])}
      {!loading && posts.length > 0 && posts.length <= 3 && examples}

      {next && !loading && (
        <button
          onClick={loadMore}
          disabled={more}
          className="w-full rounded-2xl border border-white/10 py-3 text-sm font-bold text-zinc-300 hover:bg-white/5 disabled:opacity-50"
        >
          {more ? "Carico…" : "Carica altri post"}
        </button>
      )}
        </>
      )}
      {pickingCity && (
        <CityPicker
          title="Esplora una città"
          value={city || null}
          confirmLabel="Vedi"
          onClose={() => setPickingCity(false)}
          onSelect={(c) => {
            setPickingCity(false);
            if (c) {
              setCity(c);
              setScope("city");
            }
          }}
        />
      )}
      {showMap && (
        <ActivityMap
          onClose={() => setShowMap(false)}
          onPick={(c) => {
            setShowMap(false);
            setCity(c);
            setScope("city");
          }}
        />
      )}
    </div>
  );
}

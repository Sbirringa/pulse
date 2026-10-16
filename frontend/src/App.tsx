import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity as ActivityIcon, BarChart3, Bell, LogOut, Menu, Newspaper, Plus, Search, UserRound } from "lucide-react";
import { api, errMsg } from "./api";
import type { AuthResult, Me, Meta } from "./types";
import { NavContext, type Nav } from "./nav";
import ActivityTab from "./components/ActivityTab";
import AuthScreen from "./components/AuthScreen";
import CreateSheet from "./components/CreateSheet";
import Logo from "./components/Logo";
import PulseTab from "./components/PulseTab";
import RecoveryScreen from "./components/RecoveryScreen";
import SettingsPanel from "./components/SettingsPanel";
import PollComposer from "./components/polls/PollComposer";
import PollDetail from "./components/polls/PollDetail";
import PollsTab from "./components/polls/PollsTab";
import Avatar from "./components/social/Avatar";
import OnboardingProfile from "./components/social/OnboardingProfile";
import SearchScreen from "./components/SearchScreen";
import InfoMenu from "./components/info/InfoMenu";
import { ConfirmHost } from "./confirm";
import InfoPage, { parseInfo, type InfoSlug } from "./components/info/InfoPages";
import Sheet from "./components/social/Sheet";
import PiazzaTab from "./components/social/PiazzaTab";
import { MyProfileTab, UserProfileView } from "./components/social/ProfileViews";

type Tab = "piazza" | "posts" | "polls" | "activity" | "profile";

/** Indirizzi: /p/123 = un post, /u/nome = un profilo, /q/123 = un sondaggio. */
function parsePath(path: string): { post: number | null; user: string | null; poll: number | null } {
  const p = path.match(/^\/p\/(\d+)/);
  const u = path.match(/^\/u\/([^/]+)/);
  const q = path.match(/^\/q\/(\d+)/);
  return {
    post: p ? Number(p[1]) : null,
    user: u ? decodeURIComponent(u[1]) : null,
    poll: q ? Number(q[1]) : null,
  };
}

interface AuthRequest {
  reason?: string;
  mode: "register" | "login";
}

const POLL_EVERY = 45_000; // ogni quanto si controllano le notifiche nuove (solo con l'app in primo piano)

export default function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [booting, setBooting] = useState(true);
  const [meta, setMeta] = useState<Meta>({ cities: [], categories: [], privacy: null });
  const initial = useMemo(() => parsePath(window.location.pathname), []);
  const [auth, setAuth] = useState<AuthRequest | null>(null);
  const [recovery, setRecovery] = useState<string | null>(null);
  const [onboarding, setOnboarding] = useState(false);
  const [tab, setTab] = useState<Tab>(initial.poll ? "polls" : "piazza");
  const [openPost, setOpenPost] = useState<number | null>(initial.post);
  const [openUser, setOpenUser] = useState<string | null>(initial.user);
  const [openPollId, setOpenPollId] = useState<number | null>(initial.poll);
  const [creating, setCreating] = useState(false);
  const [writingPoll, setWritingPoll] = useState(false);
  const [searching, setSearching] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [info, setInfo] = useState<InfoSlug | null>(() => parseInfo(window.location.pathname));
  const [focusCity, setFocusCity] = useState<{ city: string; n: number } | null>(null);
  // richiesta "scrivi un post" dal + : vale una volta sola, poi si spegne (prima restava accesa e il post
  // si riapriva ogni volta che si tornava alla home)
  const [composeRequest, setComposeRequest] = useState(false);
  const [feedKey, setFeedKey] = useState(0);
  const [pulseKey, setPulseKey] = useState(0);
  const [unread, setUnread] = useState(0);
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null);

  const say = useCallback((text: string, error = false) => {
    setToast({ text, error });
    window.setTimeout(() => setToast(null), 3200);
  }, []);

  useEffect(() => {
    api.meta().then(setMeta).catch(() => undefined);
    api
      .me()
      .then(setMe)
      .catch(() => setMe(null)) // ospite: può guardare tutto
      .finally(() => setBooting(false));
  }, []);

  const updateMe = useCallback((m: Partial<Me>) => setMe((cur) => (cur ? { ...cur, ...m } : cur)), []);

  // notifiche nuove: un controllo leggero ogni tanto, solo se l'app è aperta davanti
  const loggedIn = me !== null;
  useEffect(() => {
    if (!loggedIn) {
      setUnread(0);
      return;
    }
    let stop = false;
    const check = () => {
      if (document.visibilityState !== "visible") return;
      api
        .unread()
        .then((r) => {
          if (stop) return;
          setUnread(r.count);
          updateMe({ pending_requests: r.pending_requests });
        })
        .catch(() => undefined);
    };
    check();
    const t = window.setInterval(check, POLL_EVERY);
    document.addEventListener("visibilitychange", check);
    return () => {
      stop = true;
      window.clearInterval(t);
      document.removeEventListener("visibilitychange", check);
    };
  }, [loggedIn, updateMe]);

  // il tasto "indietro" del telefono chiude post, profili e sondaggi invece di uscire dall'app
  useEffect(() => {
    function onPop() {
      const r = parsePath(window.location.pathname);
      setOpenPost(r.post);
      setOpenUser(r.user);
      setOpenPollId(r.poll);
      setInfo(parseInfo(window.location.pathname));
      if (r.post) setTab("piazza");
    }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const goBack = useCallback(() => {
    if (window.history.state?.pulse) window.history.back();
    else {
      window.history.replaceState(null, "", "/");
      setOpenPost(null);
      setOpenUser(null);
      setOpenPollId(null);
      setInfo(null);
    }
  }, []);

  const openInfo = useCallback((slug: InfoSlug) => {
    setMenuOpen(false);
    window.history.pushState({ pulse: true }, "", `/${slug}`);
    setInfo(slug);
    window.scrollTo(0, 0);
  }, []);

  const nav: Nav = useMemo(
    () => ({
      me,
      updateMe,
      openProfile: (nickname: string) => {
        if (me && nickname.toLowerCase() === me.nickname.toLowerCase()) {
          setOpenUser(null);
          setOpenPollId(null);
          setTab("profile");
          window.scrollTo(0, 0);
          return;
        }
        window.history.pushState({ pulse: true }, "", `/u/${encodeURIComponent(nickname)}`);
        setOpenUser(nickname);
      },
      openPost: (id: number) => {
        window.history.pushState({ pulse: true }, "", `/p/${id}`);
        setOpenUser(null);
        setOpenPollId(null);
        setTab((t) => (t === "posts" ? "posts" : "piazza"));
        setOpenPost(id);
      },
      openPoll: (id: number) => {
        window.history.pushState({ pulse: true }, "", `/q/${id}`);
        setOpenUser(null);
        setOpenPost(null);
        setOpenPollId(id);
      },
      openCity: (city: string) => {
        window.history.replaceState(null, "", "/");
        setOpenUser(null);
        setOpenPollId(null);
        setOpenPost(null);
        setTab("piazza");
        setFocusCity((f) => ({ city, n: (f?.n ?? 0) + 1 }));
        window.scrollTo(0, 0);
      },
      requireAuth: (reason?: string, mode: "register" | "login" = "register") => {
        setAuth({ reason, mode });
        window.scrollTo(0, 0);
      },
    }),
    [me, updateMe],
  );

  const openPostView = useCallback((id: number | null) => (id === null ? goBack() : nav.openPost(id)), [goBack, nav]);

  const onAuthed = useCallback((r: AuthResult) => {
    setMe(r.user);
    setAuth(null);
    setRecovery(r.recovery_code ?? null);
    setOnboarding(Boolean(r.recovery_code)); // nuova registrazione: dopo il codice, foto e nome
    setFeedKey((k) => k + 1);
    // si resta dove si era (lo stesso post, lo stesso profilo): si continua da lì
  }, []);

  async function logout() {
    setLeaving(false);
    await api.logout().catch(() => undefined);
    setMe(null);
    setRecovery(null);
    setTab("piazza");
  }

  async function changeCity(city: string | null) {
    try {
      updateMe(await api.setCity(city));
      setFeedKey((k) => k + 1); // i sondaggi locali dipendono dalla città
    } catch (e) {
      say(errMsg(e), true);
    }
  }

  const onAnswered = useCallback(() => {
    setPulseKey((k) => k + 1);
    setMe((m) => (m ? { ...m, answered: m.answered + 1 } : m));
  }, []);

  const onSeen = useCallback(() => setUnread(0), []);

  function onDeleted() {
    setMe(null);
    setRecovery(null);
    setTab("piazza");
    window.history.replaceState(null, "", "/");
  }

  function selectTab(id: Tab) {
    if ((id === "profile" || id === "activity") && !me) {
      nav.requireAuth(id === "profile" ? "Crea il tuo profilo: foto, nome e le persone che segui" : "Entra per ricevere notifiche su chi ti segue e ti risponde");
      return;
    }
    if (info !== null || openUser !== null || openPollId !== null || ((id === "piazza" || id === "posts") && openPost !== null)) {
      window.history.replaceState(null, "", "/");
      setInfo(null);
      setOpenUser(null);
      setOpenPollId(null);
      setOpenPost(null);
    }
    setTab(id);
    window.scrollTo(0, 0);
  }

  if (booting) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Logo />
      </div>
    );
  }

  if (auth && !me) {
    return (
      <AuthScreen
        key={auth.mode + (auth.reason ?? "")}
        sharedId={initial.poll}
        cities={meta.cities}
        minAge={meta.privacy?.min_age ?? 14}
        reason={auth.reason}
        startMode={auth.mode}
        onAuthed={onAuthed}
        onCancel={() => setAuth(null)}
      />
    );
  }

  if (me && recovery) return <RecoveryScreen code={recovery} onDone={() => setRecovery(null)} />;

  if (me && onboarding) {
    return (
      <OnboardingProfile
        me={me}
        onDone={(m) => {
          updateMe(m);
          setOnboarding(false);
        }}
      />
    );
  }

  const overlay = openUser !== null || openPollId !== null;
  const bell = unread + (me?.pending_requests ?? 0);

  const tabButton = (id: Tab, label: string, icon: React.ReactNode) => {
    const active = tab === id && !overlay;
    return (
      <button
        key={id}
        onClick={() => selectTab(id)}
        aria-current={active ? "page" : undefined}
        aria-label={label}
        className={`flex flex-col items-center gap-1 pb-2.5 pt-3 text-[11px] font-semibold transition ${active ? "text-zinc-50" : "text-zinc-500 hover:text-zinc-300"}`}
      >
        {icon}
        <span>{label}</span>
        <span className={`h-1 w-1 rounded-full ${active ? "bg-pulse" : "bg-transparent"}`} />
      </button>
    );
  };

  return (
    <NavContext.Provider value={nav}>
      <div className="min-h-dvh pb-28">
        <header className="sticky top-0 z-20 border-b border-line/70 bg-ink/95 px-4 py-2.5 backdrop-blur-xl">
          <div className="mx-auto flex max-w-md items-center justify-between sm:max-w-xl lg:max-w-[640px]">
            <div className="flex items-center gap-1">
              <button
                onClick={() => setMenuOpen(true)}
                aria-label="Menu: ecosistema, sicurezza, open source, termini"
                data-testid="info-menu"
                className="-ml-2 rounded-full p-2 text-zinc-300 transition hover:bg-white/[0.07] hover:text-white"
              >
                <Menu size={22} />
              </button>
              <button onClick={() => selectTab("piazza")} aria-label="Vai a Pulse">
                <Logo />
              </button>
            </div>
            {me ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSearching(true)}
                  aria-label="Cerca"
                  className="flex h-10 items-center gap-2 rounded-full bg-white/[0.06] px-2.5 text-sm text-zinc-400 ring-1 ring-white/[0.06] hover:bg-white/[0.1] hover:text-white min-[420px]:pl-3 min-[420px]:pr-4"
                >
                  <Search size={18} /> <span className="hidden min-[420px]:inline">Cerca</span>
                </button>
                <button
                  onClick={() => setLeaving(true)}
                  data-testid="logout"
                  className="flex h-10 items-center gap-1.5 rounded-full pl-3 pr-3.5 text-sm font-semibold text-zinc-400 ring-1 ring-white/[0.08] transition hover:bg-no/10 hover:text-no hover:ring-no/30"
                >
                  <LogOut size={16} /> Esci
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-0.5">
                <button onClick={() => setSearching(true)} aria-label="Cerca" className="rounded-full p-2 text-zinc-300 hover:bg-white/[0.07] hover:text-white">
                  <Search size={20} />
                </button>
                <button onClick={() => nav.requireAuth(undefined, "login")} className="rounded-full px-2.5 py-2 text-sm font-semibold text-zinc-300 hover:text-white">
                  Accedi
                </button>
                <button onClick={() => nav.requireAuth()} className="rounded-full bg-pulse px-3.5 py-2 text-sm font-bold text-ink hover:brightness-110">
                  Registrati
                </button>
              </div>
            )}
          </div>
        </header>

        {menuOpen && <InfoMenu meta={meta} onOpen={openInfo} onClose={() => setMenuOpen(false)} />}
        <ConfirmHost />

        {leaving && me && (
          <Sheet title="Vuoi uscire?" onClose={() => setLeaving(false)}>
            <div className="flex items-center gap-3 rounded-2xl bg-white/[0.04] p-3.5">
              <Avatar name={me.name ?? me.nickname} src={me.avatar} size={44} />
              <span className="min-w-0">
                <span className="block truncate text-[15px] font-semibold">{me.name ?? `@${me.nickname}`}</span>
                <span className="block text-xs text-zinc-500">Per rientrare ti bastano nome utente e password.</span>
              </span>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2.5 pb-1">
              <button onClick={() => setLeaving(false)} className="rounded-2xl bg-white/[0.07] py-3.5 font-semibold hover:bg-white/[0.12]">
                Annulla
              </button>
              <button onClick={logout} className="flex items-center justify-center gap-2 rounded-2xl bg-no py-3.5 font-bold text-ink hover:brightness-110">
                <LogOut size={17} /> Esci
              </button>
            </div>
          </Sheet>
        )}

        <main className="mx-auto max-w-md px-4 pt-4 sm:max-w-xl lg:max-w-[640px] lg:pt-6">
          {info !== null ? (
            <InfoPage key={info} slug={info} meta={meta} onBack={goBack} go={openInfo} />
          ) : openUser !== null ? (
            <UserProfileView key={openUser} nickname={openUser} onBack={goBack} />
          ) : openPollId !== null ? (
            <PollDetail key={openPollId} id={openPollId} onBack={goBack} onMore={() => selectTab("polls")} />
          ) : (
            <>
              {(tab === "piazza" || tab === "posts") && (
                <PiazzaTab
                  key={`${tab}-${feedKey}`}
                  only={tab === "posts" ? "posts" : undefined}
                  proposalGoal={meta.proposal_goal}
                  me={me}
                  categories={meta.categories}
                  openPostId={openPost}
                  onOpenPost={openPostView}
                  onSwitchPost={(id) => {
                    // passando da un post all'altro con lo swipe non si riempie la cronologia
                    window.history.replaceState(window.history.state, "", `/p/${id}`);
                    setOpenPost(id);
                  }}
                  onCreatePoll={() => setWritingPoll(true)}
                  focusCity={focusCity}
                  composeRequest={composeRequest}
                  onComposeOpened={() => setComposeRequest(false)}
                />
              )}
              {tab === "polls" && (
                <PollsTab
                  key={feedKey}
                  me={me}
                  onCreate={() => (me ? setWritingPoll(true) : nav.requireAuth("Entra per creare un sondaggio"))}
                  onAnswered={onAnswered}
                />
              )}
              {tab === "activity" && me && <ActivityTab onSeen={onSeen} onMeChange={updateMe} />}
              {tab === "profile" && me && (
                <MyProfileTab
                  me={me}
                  onMeChange={updateMe}
                  pulse={<PulseTab me={me} refreshKey={pulseKey} />}
                  settings={<SettingsPanel me={me} cities={meta.cities} onCityChange={changeCity} onLogout={logout} onDeleted={onDeleted} />}
                />
              )}
            </>
          )}
        </main>

        {toast && (
          <p
            role={toast.error ? "alert" : "status"}
            className={`rise fixed inset-x-4 bottom-24 z-30 mx-auto max-w-md rounded-2xl px-4 py-3 text-center sm:max-w-xl lg:max-w-[640px] text-sm font-semibold shadow-xl ${
              toast.error ? "bg-no text-ink" : "bg-zinc-100 text-ink"
            }`}
          >
            {toast.text}
          </p>
        )}

        <nav
          aria-label="Navigazione principale"
          className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-ink/95 backdrop-blur-xl"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        >
          <div className="mx-auto grid max-w-md grid-cols-6 items-center px-1 sm:max-w-xl lg:max-w-[640px]">
            {tabButton("piazza", "Pulse", <ActivityIcon size={22} strokeWidth={2.2} />)}
            {tabButton("posts", "Post", <Newspaper size={22} />)}
            {tabButton("polls", "Sondaggi", <BarChart3 size={22} />)}
            <div className="flex justify-center">
              <button
                onClick={() => (me ? setCreating(true) : nav.requireAuth("Entra per pubblicare post e creare sondaggi"))}
                aria-label="Crea"
                className="flex h-12 w-12 items-center justify-center rounded-full bg-pulse text-ink shadow-lg shadow-pulse/25 transition hover:brightness-110 active:scale-95"
              >
                <Plus size={26} strokeWidth={2.6} />
              </button>
            </div>
            {tabButton(
              "activity",
              "Attività",
              <span className="relative">
                <Bell size={22} />
                {bell > 0 && (
                  <span data-testid="badge" className="absolute -right-2 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-no px-1 text-[10px] font-bold text-ink ring-2 ring-ink">
                    {bell > 99 ? "99+" : bell}
                  </span>
                )}
              </span>,
            )}
            {tabButton(
              "profile",
              "Profilo",
              me ? (
                <Avatar name={me.name ?? me.nickname} src={me.avatar} size={24} ring={tab === "profile" && !overlay} />
              ) : (
                <UserRound size={22} />
              ),
            )}
          </div>
        </nav>

        {creating && (
          <CreateSheet
            onClose={() => setCreating(false)}
            onPost={() => {
              setCreating(false);
              selectTab("piazza");
              setComposeRequest(true);
            }}
            onPoll={() => {
              setCreating(false);
              setWritingPoll(true);
            }}
          />
        )}
        {writingPoll && me && (
          <PollComposer
            me={me}
            categories={meta.categories}
            onClose={() => setWritingPoll(false)}
            onPublished={(p) => {
              setWritingPoll(false);
              selectTab("piazza");
              setFeedKey((k) => k + 1);
              say("Sondaggio pubblicato: lo vedono tutti, su Pulse e tra i Sondaggi.");
              void p;
            }}
          />
        )}
        {searching && <SearchScreen onClose={() => setSearching(false)} />}
      </div>
    </NavContext.Provider>
  );
}

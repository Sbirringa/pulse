import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, Check, Eye, EyeOff } from "lucide-react";
import { api, errMsg } from "../api";
import type { AuthResult, Question } from "../types";
import Logo from "./Logo";
import { CityField } from "./map/CityPicker";

type Mode = "register" | "login" | "recover";

const inputCls =
  "mt-1.5 w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-base outline-none placeholder:text-zinc-600 focus:border-pulse";

export default function AuthScreen({
  sharedId,
  minAge,
  reason,
  startMode = "register",
  onAuthed,
  onCancel,
}: {
  sharedId: number | null;
  cities?: string[];
  minAge: number;
  reason?: string;
  startMode?: "register" | "login";
  onAuthed: (r: AuthResult) => void;
  onCancel?: () => void;
}) {
  const [mode, setMode] = useState<Mode>(startMode);
  const [nickname, setNickname] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [code, setCode] = useState("");
  const [city, setCity] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [teaser, setTeaser] = useState<Question | null>(null);

  useEffect(() => {
    if (sharedId === null) return;
    api.publicQuestion(sharedId).then(setTeaser).catch(() => setTeaser(null));
  }, [sharedId]);

  // chi crea o cambia la password la scrive due volte: un errore di battitura non ti chiude fuori
  const newPassword = mode !== "login";
  const mismatch = newPassword && password2.length > 0 && password !== password2;
  const matches = newPassword && password.length >= 10 && password === password2;

  useEffect(() => {
    setPassword2("");
    setShowPw(false);
  }, [mode]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (newPassword && password !== password2) {
      setError("Le due password non coincidono.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result =
        mode === "register"
          ? await api.register(nickname.trim(), password, city || null, consent)
          : mode === "login"
            ? await api.login(nickname.trim(), password)
            : await api.recover(nickname.trim(), code.trim(), password);
      onAuthed(result);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  const tabs: { id: Mode; label: string }[] = [
    { id: "register", label: "Crea account" },
    { id: "login", label: "Accedi" },
  ];

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-5 pb-10 pt-8">
      <Logo />

      {onCancel && (
        <button onClick={onCancel} className="mt-6 flex items-center gap-1.5 self-start text-sm font-semibold text-zinc-400 hover:text-white">
          <ArrowLeft size={17} /> Continua a guardare
        </button>
      )}

      <section className="rise mt-8">
        {reason && (
          <p className="mb-4 inline-block rounded-full border border-pulse/40 bg-pulse/10 px-3.5 py-1.5 text-sm font-semibold text-pulse">
            {reason}
          </p>
        )}
        <h1 className="text-5xl font-black leading-[0.95] tracking-tight">
          Fatti
          <br />
          sentire.
        </h1>
        <p className="mt-4 text-base leading-7 text-zinc-400">
          Lavoro, prezzi, servizi, la tua città: confrontati con gli altri e trova chi vuole cambiare le cose con te.
          Bastano un nome utente e una password.
        </p>
      </section>

      {teaser && (
        <article className="rise mt-7 rounded-3xl border border-white/10 bg-panel ring-1 ring-white/[0.07] p-5">
          <p className="text-sm font-semibold text-pulse">Ti hanno inviato questo sondaggio</p>
          <h2 className="mt-2 text-xl font-extrabold leading-snug">{teaser.title}</h2>
          <p className="mt-2 text-sm leading-6 text-zinc-400">{teaser.description}</p>
          <p className="mt-3 text-xs text-zinc-500">
            {teaser.participants > 0 ? `${teaser.participants} persone hanno già risposto · ` : ""}
            entra per votare e vedere i risultati
          </p>
        </article>
      )}

      <form
        onSubmit={submit}
        className="card mt-7 space-y-4 p-5"
      >
        {mode !== "recover" ? (
          <div className="grid grid-cols-2 rounded-xl bg-black/40 p-1" role="tablist">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={mode === t.id}
                onClick={() => {
                  setMode(t.id);
                  setError("");
                }}
                className={`rounded-lg px-3 py-2 text-sm font-bold transition ${
                  mode === t.id ? "bg-pulse text-ink" : "text-zinc-400 hover:text-white"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        ) : (
          <div>
            <h2 className="text-lg font-extrabold">Recupera il tuo account</h2>
            <p className="mt-1 text-sm text-zinc-400">
              Usa il codice di recupero che ti abbiamo mostrato alla registrazione.
            </p>
          </div>
        )}

        <label className="block text-sm text-zinc-300">
          Nome utente
          <input
            required
            minLength={3}
            maxLength={24}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            className={inputCls}
            placeholder="Scegli un nome utente (es. giulia.rossi)"
          />
        </label>

        {mode === "recover" && (
          <label className="block text-sm text-zinc-300">
            Codice di recupero
            <input
              required
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className={`${inputCls} font-mono tracking-widest`}
              placeholder="XXXXX-XXXXX-XXXXX-XXXXX"
            />
          </label>
        )}

        <label className="block text-sm text-zinc-300">
          {mode === "recover" ? "Nuova password" : "Password"}
          <span className="relative block">
            <input
              required
              type={showPw ? "text" : "password"}
              minLength={mode === "login" ? undefined : 10}
              maxLength={128}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={`${inputCls} pr-12`}
              placeholder={mode === "login" ? "La tua password" : "Almeno 10 caratteri"}
            />
            <button
              type="button"
              onClick={() => setShowPw((v) => !v)}
              aria-label={showPw ? "Nascondi password" : "Mostra password"}
              className="absolute right-2 top-1/2 mt-[3px] -translate-y-1/2 rounded-lg p-2 text-zinc-500 hover:text-white"
            >
              {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </span>
        </label>

        {newPassword && (
          <label className="block text-sm text-zinc-300">
            Conferma password
            <span className="relative block">
              <input
                required
                type={showPw ? "text" : "password"}
                maxLength={128}
                autoComplete="new-password"
                value={password2}
                onChange={(e) => setPassword2(e.target.value)}
                aria-invalid={mismatch}
                className={`${mismatch ? inputCls.replace("border-white/10", "border-rose-400/80").replace("focus:border-pulse", "focus:border-rose-400") : inputCls} pr-12`}
                placeholder="Riscrivila uguale"
              />
              {matches && (
                <Check size={18} aria-hidden className="absolute right-4 top-1/2 mt-[3px] -translate-y-1/2 text-pulse" />
              )}
            </span>
            {mismatch && (
              <span role="alert" className="mt-1.5 block text-xs text-no">
                Le due password non coincidono.
              </span>
            )}
          </label>
        )}

        {mode === "register" && (
          <div className="block text-sm text-zinc-300">
            La tua città <span className="text-zinc-500">(facoltativa)</span>
            <CityField value={city || null} onChange={(c) => setCity(c ?? "")} placeholder="Cerca il tuo comune" />
            <span className="mt-1.5 block text-xs text-zinc-500">
              Ti mostriamo i post e i sondaggi della tua zona. Non è verificata.
            </span>
          </div>
        )}

        {mode === "register" && (
          <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-black/30 p-3 text-xs leading-5 text-zinc-300">
            <input
              type="checkbox"
              required
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-0.5 h-5 w-5 shrink-0 accent-[#c8ff3d]"
            />
            <span>
              Ho almeno {minAge} anni, accetto i{" "}
              <a href="/termini" target="_blank" rel="noopener" className="font-semibold text-pulse underline">
                Termini di utilizzo
              </a>
              , ho letto l'
              <a href="/privacy" target="_blank" rel="noopener" className="font-semibold text-pulse underline">
                informativa privacy
              </a>{" "}
              e acconsento al trattamento dei miei dati, comprese le risposte ai sondaggi che possono rivelare le mie
              opinioni politiche. So che ciò che pubblico su Pulse è visibile a tutti. Posso revocare il consenso
              eliminando l'account.
            </span>
          </label>
        )}

        {error && (
          <p role="alert" className="rounded-xl bg-no/10 px-3 py-2 text-sm text-no">
            {error}
          </p>
        )}

        <button
          disabled={busy || (mode === "register" && !consent) || mismatch}
          className="w-full rounded-xl bg-pulse py-3.5 text-base font-extrabold text-ink transition hover:brightness-110 active:scale-[0.99] disabled:opacity-60"
        >
          {busy ? "Attendi…" : mode === "register" ? "Entra in Pulse" : mode === "login" ? "Accedi" : "Reimposta la password"}
        </button>

        <div className="flex items-center justify-between text-xs text-zinc-500">
          <span>Niente email, telefono o GPS.</span>
          {mode === "recover" ? (
            <button type="button" onClick={() => setMode("login")} className="text-zinc-300 underline">
              Torna all'accesso
            </button>
          ) : (
            <button type="button" onClick={() => setMode("recover")} className="text-zinc-300 underline">
              Password dimenticata?
            </button>
          )}
        </div>
      </form>

      <p className="mt-6 text-center text-xs leading-5 text-zinc-600">
        I risultati mostrano le risposte degli utenti di Pulse: non sono un sondaggio rappresentativo della
        popolazione. ·{" "}
        <a href="/termini" className="underline hover:text-zinc-400">
          Termini
        </a>{" "}
        ·{" "}
        <a href="/privacy" className="underline hover:text-zinc-400">
          Privacy
        </a>
      </p>
    </main>
  );
}

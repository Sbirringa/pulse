import { useState, type FormEvent, type ReactNode } from "react";
import { Check, ChevronRight, Copy, Eye, EyeOff, KeyRound, LifeBuoy } from "lucide-react";
import { api, errMsg } from "../api";
import Sheet from "./social/Sheet";

const inputCls =
  "mt-1.5 w-full rounded-xl border border-line bg-raised px-4 py-3 text-base outline-none placeholder:text-zinc-600 focus:border-pulse";

/** Impostazioni → «Accesso»: cambia password e nuovo codice di recupero. */
export default function AccountSecurity() {
  const [open, setOpen] = useState<null | "password" | "code">(null);
  const [note, setNote] = useState("");

  const row = (icon: ReactNode, title: string, text: string, onClick: () => void) => (
    <button onClick={onClick} className="-mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-xl px-2 py-3 text-left transition hover:bg-white/[0.04]">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] text-zinc-300">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold text-zinc-100">{title}</span>
        <span className="block text-xs text-zinc-500">{text}</span>
      </span>
      <ChevronRight size={17} className="text-zinc-600" />
    </button>
  );

  return (
    <section className="card p-5">
      <p className="text-sm font-semibold text-zinc-300">Accesso</p>
      <div className="mt-1 divide-y divide-line">
        {row(<KeyRound size={17} />, "Cambia password", "Sugli altri dispositivi dovrai rientrare", () => setOpen("password"))}
        {row(<LifeBuoy size={17} />, "Nuovo codice di recupero", "Se hai perso quello che hai salvato", () => setOpen("code"))}
      </div>
      {note && <p className="mt-2 rounded-xl bg-pulse/10 px-3 py-2 text-xs font-semibold text-pulse">{note}</p>}
      {open === "password" && (
        <ChangePassword
          onClose={() => setOpen(null)}
          onDone={() => {
            setOpen(null);
            setNote("Password cambiata. Il codice di recupero resta lo stesso.");
          }}
        />
      )}
      {open === "code" && <NewCode onClose={() => setOpen(null)} />}
    </section>
  );
}

function PasswordInput({ label, value, onChange, show, auto, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; show: boolean; auto: string; placeholder?: string;
}) {
  return (
    <label className="block text-sm font-semibold text-zinc-300">
      {label}
      <input
        required
        type={show ? "text" : "password"}
        autoComplete={auto}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={inputCls}
      />
    </label>
  );
}

function ChangePassword({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [again, setAgain] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const mismatch = again.length > 0 && next !== again;
  const ok = current.length > 0 && next.length >= 10 && next === again;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!ok) return;
    setBusy(true);
    setError("");
    try {
      await api.changePassword(current, next);
      onDone();
    } catch (err) {
      setError(errMsg(err));
      setBusy(false);
    }
  }

  return (
    <Sheet title="Cambia password" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3.5 pb-1">
        <PasswordInput label="Password attuale" value={current} onChange={setCurrent} show={show} auto="current-password" />
        <PasswordInput label="Nuova password" value={next} onChange={setNext} show={show} auto="new-password" placeholder="Almeno 10 caratteri" />
        <PasswordInput label="Ripeti la nuova password" value={again} onChange={setAgain} show={show} auto="new-password" placeholder="Riscrivila uguale" />
        {mismatch && <p className="text-xs font-semibold text-no">Le due password non coincidono.</p>}
        <button type="button" onClick={() => setShow((s) => !s)} className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-400 hover:text-white">
          {show ? <EyeOff size={14} /> : <Eye size={14} />} {show ? "Nascondi le password" : "Mostra le password"}
        </button>
        {error && <p role="alert" className="rounded-xl bg-no/10 px-3 py-2 text-sm text-no">{error}</p>}
        <button
          disabled={!ok || busy}
          className="w-full rounded-2xl bg-pulse py-3.5 font-display text-[15.5px] font-bold text-ink transition hover:brightness-110 disabled:bg-white/10 disabled:text-zinc-500"
        >
          {busy ? "Un attimo…" : "Salva la nuova password"}
        </button>
        <p className="text-center text-xs leading-5 text-zinc-500">
          Su questo dispositivo resti dentro; sugli altri dovrai accedere con la nuova password.
        </p>
      </form>
    </Sheet>
  );
}

function NewCode({ onClose }: { onClose: () => void }) {
  const [password, setPassword] = useState("");
  const [code, setCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      setCode((await api.newRecoveryCode(password)).recovery_code);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(code ?? "");
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* resta selezionabile a mano */
    }
  }

  if (code) {
    return (
      <Sheet title="Il tuo nuovo codice" onClose={() => saved && onClose()}>
        <p className="text-sm leading-6 text-zinc-400">
          Il codice vecchio non funziona più. Questo lo vedi <strong className="text-zinc-200">solo ora</strong>: salvalo in un posto sicuro.
        </p>
        <div className="mt-4 rounded-2xl border border-pulse/40 bg-black/30 p-5 text-center">
          <p className="select-all break-all font-mono text-2xl font-bold tracking-widest text-pulse" data-testid="new-code">{code}</p>
          <button onClick={copy} className="mt-4 inline-flex items-center gap-2 rounded-lg border border-white/15 px-4 py-2 text-sm font-semibold hover:bg-white/5">
            {copied ? <Check size={16} /> : <Copy size={16} />} {copied ? "Copiato" : "Copia"}
          </button>
        </div>
        <label className="mt-4 flex cursor-pointer items-start gap-3 text-sm text-zinc-300">
          <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} className="mt-0.5 h-5 w-5 accent-[#c8ff3d]" />
          Ho salvato il codice in un posto sicuro.
        </label>
        <button
          disabled={!saved}
          onClick={onClose}
          className="mt-4 w-full rounded-2xl bg-pulse py-3.5 font-display text-[15.5px] font-bold text-ink transition hover:brightness-110 disabled:bg-white/10 disabled:text-zinc-500"
        >
          Fatto
        </button>
      </Sheet>
    );
  }

  return (
    <Sheet title="Nuovo codice di recupero" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3.5 pb-1">
        <p className="text-sm leading-6 text-zinc-400">
          Serve se dimentichi la password. Creandone uno nuovo, <strong className="text-zinc-200">quello vecchio smette di funzionare</strong>.
        </p>
        <PasswordInput label="Conferma con la tua password" value={password} onChange={setPassword} show={false} auto="current-password" />
        {error && <p role="alert" className="rounded-xl bg-no/10 px-3 py-2 text-sm text-no">{error}</p>}
        <button
          disabled={!password || busy}
          className="w-full rounded-2xl bg-pulse py-3.5 font-display text-[15.5px] font-bold text-ink transition hover:brightness-110 disabled:bg-white/10 disabled:text-zinc-500"
        >
          {busy ? "Un attimo…" : "Crea il nuovo codice"}
        </button>
      </form>
    </Sheet>
  );
}

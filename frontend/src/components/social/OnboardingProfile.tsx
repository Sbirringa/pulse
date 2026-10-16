import { useState, type FormEvent } from "react";
import { api, errMsg } from "../../api";
import type { Me } from "../../types";
import Logo from "../Logo";
import AvatarPicker from "./AvatarPicker";

/** Subito dopo la registrazione: foto e nome in un'unica schermata. Si può saltare. */
export default function OnboardingProfile({ me, onDone }: { me: Me; onDone: (m: Partial<Me>) => void }) {
  const [name, setName] = useState("");
  const [avatar, setAvatar] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      onDone({ avatar });
      return;
    }
    setBusy(true);
    setError("");
    try {
      const r = await api.updateProfile({ display_name: name });
      onDone({ ...r, avatar });
    } catch (err) {
      setError(errMsg(err));
      setBusy(false);
    }
  }

  return (
    <main className="relative mx-auto flex min-h-dvh max-w-md flex-col overflow-hidden px-5 pb-10 pt-8">
      <div aria-hidden className="pointer-events-none absolute -right-24 top-24 h-72 w-72 rounded-full bg-pulse/15 blur-3xl" />
      <Logo />
      <form onSubmit={save} className="rise relative mt-12 flex flex-1 flex-col">
        <p className="text-sm font-semibold text-pulse">Ultimo passo</p>
        <h1 className="mt-3 text-4xl font-black leading-[1.05] tracking-tight">Fatti riconoscere.</h1>
        <p className="mt-3 text-base leading-7 text-zinc-400">
          Con il tuo volto e il tuo nome le tue idee pesano di più. Puoi cambiarli quando vuoi.
        </p>

        <div className="mt-10 flex flex-col items-center">
          <AvatarPicker name={name || me.nickname} avatar={avatar} size={128} onChange={setAvatar} />
          <p className="mt-3 text-sm text-zinc-500">{avatar ? "Bella foto!" : "Tocca per aggiungere una foto"}</p>
        </div>

        <label className="mt-8 block text-sm text-zinc-300">
          Nome e cognome
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={60}
            autoComplete="name"
            placeholder="Es. Giulia Rossi"
            className="mt-1.5 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3.5 text-lg outline-none placeholder:text-zinc-600 focus:border-pulse"
          />
        </label>
        <p className="mt-2 text-xs text-zinc-500">
          Chiunque visiti Pulse vedrà nome, foto e @{me.nickname}. I tuoi voti ai sondaggi restano sempre anonimi.
        </p>
        {error && <p role="alert" className="mt-3 rounded-xl bg-no/10 px-3 py-2 text-sm text-no">{error}</p>}

        <div className="mt-auto pt-8">
          <button disabled={busy} className="w-full rounded-2xl bg-pulse py-4 text-base font-extrabold text-ink transition hover:brightness-110 active:scale-[0.99] disabled:opacity-50">
            {busy ? "Salvo…" : name.trim() || avatar ? "Entra in Pulse" : "Continua"}
          </button>
          <button type="button" onClick={() => onDone({ avatar })} className="mt-3 w-full py-2 text-sm font-semibold text-zinc-500 hover:text-white">
            Lo faccio dopo
          </button>
        </div>
      </form>
    </main>
  );
}

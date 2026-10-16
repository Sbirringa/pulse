import { useState } from "react";
import { Check, Copy, ShieldAlert } from "lucide-react";
import Logo from "./Logo";

export default function RecoveryScreen({ code, onDone }: { code: string; onDone: () => void }) {
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* il codice resta selezionabile a mano */
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col px-5 pb-10 pt-8">
      <Logo />
      <section className="rise mt-10">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-maybe/15 text-amber-300">
          <ShieldAlert size={26} />
        </div>
        <h1 className="mt-5 text-3xl font-black leading-tight tracking-tight">Salva il tuo codice di recupero</h1>
        <p className="mt-3 text-base leading-7 text-zinc-400">
          Non abbiamo la tua email, quindi questo codice è l'<strong className="text-zinc-200">unico modo</strong> di
          rientrare se dimentichi la password. Lo vedi solo ora.
        </p>

        <div className="mt-6 rounded-2xl border border-pulse/40 bg-black/40 p-5 text-center">
          <p className="select-all break-all font-mono text-2xl font-bold tracking-widest text-pulse">{code}</p>
          <button
            onClick={copy}
            className="mt-4 inline-flex items-center gap-2 rounded-lg border border-white/15 px-4 py-2 text-sm font-semibold hover:bg-white/5"
          >
            {copied ? <Check size={16} /> : <Copy size={16} />}
            {copied ? "Copiato" : "Copia"}
          </button>
        </div>
        <p className="mt-3 text-xs leading-5 text-zinc-500">
          Conservalo in un password manager o in un posto sicuro. Chi lo possiede può reimpostare la tua password.
        </p>

        <label className="mt-6 flex cursor-pointer items-start gap-3 text-sm text-zinc-300">
          <input
            type="checkbox"
            checked={saved}
            onChange={(e) => setSaved(e.target.checked)}
            className="mt-0.5 h-5 w-5 accent-[#c8ff3d]"
          />
          Ho salvato il codice in un posto sicuro.
        </label>

        <button
          disabled={!saved}
          onClick={onDone}
          className="mt-6 w-full rounded-xl bg-pulse py-3.5 text-base font-extrabold text-ink transition hover:brightness-110 disabled:opacity-40"
        >
          Inizia
        </button>
      </section>
    </main>
  );
}

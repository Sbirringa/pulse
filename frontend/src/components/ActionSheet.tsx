import { useState, type ReactNode } from "react";
import Sheet from "./social/Sheet";

export interface Action {
  label: string;
  icon: ReactNode;
  danger?: boolean;
  disabled?: boolean;
  /** Se presente, prima di eseguire chiede conferma con questa domanda. */
  confirm?: { question: string; detail?: string; yes: string };
  onSelect: () => void | Promise<void>;
}

/** Elenco di azioni che sale dal basso (Elimina, Segnala, Condividi…), con conferma per quelle distruttive. */
export default function ActionSheet({ title, actions, onClose }: { title: string; actions: Action[]; onClose: () => void }) {
  const [asking, setAsking] = useState<Action | null>(null);
  const [busy, setBusy] = useState(false);

  async function run(a: Action) {
    setBusy(true);
    try {
      await a.onSelect();
    } finally {
      setBusy(false);
      onClose();
    }
  }

  return (
    <Sheet title={asking ? asking.confirm!.question : title} onClose={onClose}>
      {asking ? (
        <div className="space-y-3 pb-1">
          {asking.confirm!.detail && <p className="text-sm leading-6 text-zinc-400">{asking.confirm!.detail}</p>}
          <button
            disabled={busy}
            onClick={() => run(asking)}
            className="w-full rounded-2xl bg-no py-3.5 font-bold text-ink transition hover:brightness-110 disabled:opacity-60"
          >
            {busy ? "Un attimo…" : asking.confirm!.yes}
          </button>
          <button onClick={() => setAsking(null)} className="w-full rounded-2xl py-3 font-semibold text-zinc-400 hover:text-white">
            Annulla
          </button>
        </div>
      ) : (
        <ul className="-mx-2 pb-1">
          {actions.map((a) => (
            <li key={a.label}>
              <button
                disabled={a.disabled || busy}
                onClick={() => (a.confirm ? setAsking(a) : run(a))}
                className={`flex w-full items-center gap-3.5 rounded-2xl px-3 py-3.5 text-left text-[15px] font-semibold transition hover:bg-white/5 disabled:opacity-40 ${
                  a.danger ? "text-no" : "text-zinc-100"
                }`}
              >
                <span className={a.danger ? "text-no" : "text-zinc-400"}>{a.icon}</span>
                {a.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}

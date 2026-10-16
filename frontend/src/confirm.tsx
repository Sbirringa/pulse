import { useEffect, useState, type ReactNode } from "react";
import Sheet from "./components/social/Sheet";

/**
 * Conferma nello stile dell'app (al posto delle finestre del browser "127.0.0.1 dice…").
 *   if (await confirmDialog({ title: "Eliminare il commento?", yes: "Elimina", danger: true })) …
 */
export interface ConfirmOptions {
  title: string;
  detail?: ReactNode;
  yes: string;
  no?: string;
  danger?: boolean;
}

type Pending = ConfirmOptions & { resolve: (ok: boolean) => void };
let show: ((p: Pending) => void) | null = null;

export function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    if (show) show({ ...opts, resolve });
    else resolve(window.confirm(opts.title)); // nessun contenitore montato (non dovrebbe succedere)
  });
}

/** Va montato una volta (in App): mostra le conferme richieste da qualsiasi punto dell'app. */
export function ConfirmHost() {
  const [pending, setPending] = useState<Pending | null>(null);
  useEffect(() => {
    show = (p) => setPending(p);
    return () => {
      show = null;
    };
  }, []);
  if (!pending) return null;
  const close = (ok: boolean) => {
    pending.resolve(ok);
    setPending(null);
  };
  return (
    <Sheet title={pending.title} onClose={() => close(false)}>
      {pending.detail && <p className="text-sm leading-6 text-zinc-400">{pending.detail}</p>}
      <div className="mt-5 grid grid-cols-2 gap-2.5 pb-1">
        <button onClick={() => close(false)} className="rounded-2xl bg-white/[0.07] py-3.5 font-semibold text-zinc-200 hover:bg-white/[0.12]">
          {pending.no ?? "Annulla"}
        </button>
        <button
          onClick={() => close(true)}
          className={`rounded-2xl py-3.5 font-bold transition hover:brightness-110 ${pending.danger ? "bg-no text-ink" : "bg-pulse text-ink"}`}
        >
          {pending.yes}
        </button>
      </div>
    </Sheet>
  );
}

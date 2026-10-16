import { useState } from "react";
import { Lock, MapPin } from "lucide-react";
import { api, errMsg } from "../../api";
import type { Me } from "../../types";
import { useNav } from "../../nav";
import Sheet from "./Sheet";

/** Sono "di qui"? Città del profilo oppure città dichiarata (si chiede una volta per città). */
export function isLocal(me: Me | null, city: string | null | undefined): boolean {
  if (!me || !city) return false;
  return me.city === city || (me.places ?? []).includes(city);
}

/** Etichetta sui contenuti riservati: "Solo chi è di Bari". */
export function LocalOnly({ city }: { city: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-maybe/[0.12] px-2 py-0.5 text-[11px] font-semibold text-maybe">
      <Lock size={10} /> Solo chi è di {city}
    </span>
  );
}

/**
 * "Sei di Bari?" — la prima volta che si partecipa a qualcosa riservato a una città.
 * Vale per tutti i post e sondaggi di quella città; si toglie dalle Impostazioni.
 */
export default function DeclareCity({ city, onClose, onDone }: { city: string; onClose: () => void; onDone: () => void }) {
  const { me, updateMe } = useNav();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function yes() {
    setBusy(true);
    setError("");
    try {
      const r = await api.addPlace(city);
      updateMe({ places: r.places });
      onDone();
    } catch (e) {
      setError(errMsg(e));
      setBusy(false);
    }
  }

  return (
    <Sheet title={`Sei di ${city}?`} onClose={onClose}>
      <div className="flex gap-3 rounded-2xl bg-white/[0.04] p-4">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-maybe/[0.14] text-maybe">
          <MapPin size={19} />
        </span>
        <p className="text-sm leading-6 text-zinc-300">
          Qui partecipano solo le persone di <strong className="text-zinc-50">{city}</strong>: chi ci vive, ci lavora o ci studia.
          Lo chiediamo <strong className="text-zinc-50">una volta sola</strong> e vale per tutti i post e i sondaggi di {city}.
        </p>
      </div>
      {error && <p role="alert" className="mt-3 rounded-xl bg-no/10 px-3 py-2 text-sm text-no">{error}</p>}
      <div className="mt-4 grid gap-2.5 pb-1">
        <button disabled={busy} onClick={yes} className="rounded-2xl bg-pulse py-3.5 font-display text-[15.5px] font-bold text-ink transition hover:brightness-110 disabled:opacity-60">
          {busy ? "Un attimo…" : `Sì, sono di ${city}`}
        </button>
        <button onClick={onClose} className="rounded-2xl bg-white/[0.07] py-3.5 font-semibold text-zinc-200 hover:bg-white/[0.12]">
          No, leggo soltanto
        </button>
      </div>
      <p className="mt-3 text-center text-xs leading-5 text-zinc-500">
        {me?.city ? <>La città del tuo profilo resta <strong className="text-zinc-300">{me.city}</strong>: {city} si aggiunge. </> : null}
        È una tua dichiarazione: la togli quando vuoi da Profilo → Impostazioni.
      </p>
    </Sheet>
  );
}

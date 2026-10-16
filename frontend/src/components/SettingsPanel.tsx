import { useState } from "react";
import { LogOut, MapPin, ShieldCheck, X } from "lucide-react";
import { api, errMsg } from "../api";
import { useNav } from "../nav";
import type { Me } from "../types";
import DeleteAccount from "./DeleteAccount";
import CityPicker, { CityField } from "./map/CityPicker";

/** Le altre città di cui hai detto «sono di qui» (ci lavori o studi): ci partecipi come persona del posto. */
function Places({ me }: { me: Me }) {
  const { updateMe } = useNav();
  const [error, setError] = useState("");
  const places = me.places ?? [];
  if (!places.length) return null;
  async function remove(city: string) {
    try {
      updateMe({ places: (await api.removePlace(city)).places });
    } catch (e) {
      setError(errMsg(e));
    }
  }
  return (
    <div className="mt-4 border-t border-line pt-4">
      <p className="text-sm font-semibold text-zinc-300">Sei anche di</p>
      <ul className="mt-2 flex flex-wrap gap-2">
        {places.map((c) => (
          <li key={c} className="inline-flex items-center gap-1.5 rounded-full border border-line bg-raised py-1.5 pl-3 pr-1.5 text-sm text-zinc-200">
            <MapPin size={13} className="text-zinc-500" /> {c}
            <button onClick={() => remove(c)} aria-label={`Togli ${c}`} className="rounded-full p-1 text-zinc-500 hover:bg-white/10 hover:text-white">
              <X size={13} />
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs leading-5 text-zinc-500">
        Le hai dichiarate partecipando a post e sondaggi riservati. Togliendone una, lì leggi soltanto.
      </p>
      {error && <p className="mt-2 text-xs text-no">{error}</p>}
    </div>
  );
}

const LAST = "pulse.lastCity";
const readLast = () => {
  try {
    return localStorage.getItem(LAST);
  } catch {
    return null;
  }
};
const saveLast = (c: string) => {
  try {
    localStorage.setItem(LAST, c);
  } catch {
    /* il browser non salva: pazienza, la si risceglie */
  }
};

/** La tua città, con l'interruttore per toglierla o rimetterla al volo. */
function CitySetting({ me, onCityChange }: { me: Me; onCityChange: (city: string | null) => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const on = Boolean(me.city);

  async function apply(city: string | null) {
    setBusy(true);
    if (me.city) saveLast(me.city); // la ricordiamo: riaccendendo torna con un tocco
    await onCityChange(city);
    setBusy(false);
  }

  function toggle(next: boolean) {
    if (!next) return void apply(null);
    const last = readLast();
    if (last) void apply(last);
    else setPicking(true);
  }

  return (
    <>
      <div className="flex items-center justify-between gap-4">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-zinc-300">
          <MapPin size={15} /> La tua città
        </span>
        <label className={`flex items-center gap-2.5 ${busy ? "opacity-60" : "cursor-pointer"}`}>
          <span className="text-xs font-semibold text-zinc-500">{on ? "Indicata" : "Non indicata"}</span>
          <input
            type="checkbox"
            role="switch"
            aria-label="Indica la tua città"
            data-testid="city-switch"
            checked={on}
            disabled={busy}
            onChange={(e) => toggle(e.target.checked)}
            className="peer sr-only"
          />
          <span
            aria-hidden
            className="relative h-7 w-12 shrink-0 rounded-full bg-white/15 transition peer-checked:bg-pulse peer-focus-visible:ring-2 peer-focus-visible:ring-pulse after:absolute after:left-1 after:top-1 after:h-5 after:w-5 after:rounded-full after:bg-white after:transition peer-checked:after:translate-x-5"
          />
        </label>
      </div>
      {on ? (
        <>
          <CityField value={me.city} onChange={(c) => void apply(c)} placeholder="Cerca il tuo comune" />
          <p className="mt-2 text-xs leading-5 text-zinc-500">
            Sblocca le questioni e i post della tua zona. Non compare sul profilo: è una tua dichiarazione, non una residenza verificata.
          </p>
        </>
      ) : (
        <p className="mt-2 text-xs leading-5 text-zinc-500">
          Nessuna città: vedi i contenuti di tutta Italia. Riattivala quando vuoi{readLast() ? ` (torna ${readLast()})` : ""}.
        </p>
      )}
      {picking && (
        <CityPicker
          value={null}
          onClose={() => setPicking(false)}
          onSelect={(c) => {
            setPicking(false);
            if (c) void apply(c);
          }}
        />
      )}
    </>
  );
}

export default function SettingsPanel({
  me,
  cities,
  onCityChange,
  onLogout,
  onDeleted,
}: {
  me: Me;
  cities: string[];
  onCityChange: (city: string | null) => Promise<void>;
  onLogout: () => void;
  onDeleted: () => void;
}) {
  return (
    <div className="rise space-y-4">
      <section className="card p-5">
        <CitySetting me={me} onCityChange={onCityChange} />
        <Places me={me} />
      </section>

      <section className="card p-5">
        <p className="flex items-center gap-2 text-sm font-bold">
          <ShieldCheck size={17} className="text-pulse" /> I tuoi dati sono cifrati
        </p>
        <p className="mt-1.5 text-xs leading-5 text-zinc-500">
          Nome, nome utente, bio, città, testi e foto sono salvati cifrati: chi apre il database o l'archivio delle
          foto vede solo dati illeggibili. I tuoi voti ai sondaggi non sono mai mostrati con il tuo nome.
        </p>
        <a href="/privacy" className="mt-3 inline-block text-sm text-zinc-300 underline hover:text-white">
          Leggi l'informativa privacy
        </a>
      </section>

      <button
        onClick={onLogout}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border border-white/10 py-3.5 text-sm font-bold text-zinc-300 hover:bg-white/5"
      >
        <LogOut size={16} /> Esci
      </button>

      <div className="border-t border-white/10 pt-5">
        <DeleteAccount onDeleted={onDeleted} />
      </div>
    </div>
  );
}

import { useState } from "react";
import { Check, ChevronDown, Lock, MapPin, Users } from "lucide-react";
import { api, errMsg } from "../../api";
import { useNav } from "../../nav";
import CityPicker from "./CityPicker";

export type Audience = "all" | "local";

/**
 * Dove si pubblica: "Tutta Italia" oppure una città scelta qui (ricerca, mappa o posizione).
 * Solo per una città, una domanda in più: chi può partecipare (tutti, oppure solo chi è di lì).
 * Se il profilo non ha ancora una città, propone di salvarla con un tocco.
 */
export default function WherePicker({
  kind,
  scope,
  city,
  onChange,
  audience = "all",
  onAudience,
}: {
  kind: "post" | "poll";
  scope: "national" | "local";
  city: string;
  onChange: (scope: "national" | "local", city: string) => void;
  audience?: Audience;
  onAudience?: (a: Audience) => void;
}) {
  const { me, updateMe } = useNav();
  const [picking, setPicking] = useState(false);
  const [note, setNote] = useState("");
  const local = scope === "local" && city;

  async function saveAsMine() {
    try {
      updateMe(await api.setCity(city));
      setNote("");
    } catch (e) {
      setNote(errMsg(e));
    }
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-1 rounded-2xl border border-line bg-raised p-1" role="radiogroup" aria-label="Dove">
        <button
          type="button"
          role="radio"
          aria-checked={!local}
          onClick={() => onChange("national", city)}
          className={`rounded-xl py-2.5 text-sm font-semibold transition ${!local ? "bg-zinc-50 text-ink" : "text-zinc-400 hover:text-white"}`}
        >
          Tutta Italia
        </button>
        <button
          type="button"
          role="radio"
          aria-checked={Boolean(local)}
          aria-label={city ? `Città: ${city}` : "Scegli una città"}
          onClick={() => (city && !local ? onChange("local", city) : setPicking(true))}
          className={`flex min-w-0 items-center justify-center gap-1.5 rounded-xl px-2 py-2.5 text-sm font-semibold transition ${local ? "bg-zinc-50 text-ink" : "text-zinc-400 hover:text-white"}`}
        >
          <MapPin size={15} className="shrink-0" />
          <span className="truncate">{city || "Scegli città"}</span>
          <ChevronDown size={15} className="shrink-0" />
          {local && <span className="sr-only">(tocca per cambiare)</span>}
        </button>
      </div>

      {local && me && !me.city && (
        <div className="mt-2 flex items-center justify-between gap-3 rounded-xl bg-white/[0.05] px-3 py-2 text-xs text-zinc-300">
          <span>Vivi a {city}? Salvala nel profilo: vedrai i post e i sondaggi della tua zona.</span>
          <button type="button" onClick={saveAsMine} className="flex shrink-0 items-center gap-1 rounded-full bg-pulse px-3 py-1.5 font-bold text-ink">
            <Check size={13} /> Sì
          </button>
        </div>
      )}
      {local && onAudience && (
        <div className="mt-4">
          <p className="mb-2.5 text-[13.5px] font-semibold text-zinc-200">{kind === "poll" ? "Chi può votare?" : "Chi può partecipare?"}</p>
          <div className="space-y-2" role="radiogroup" aria-label={kind === "poll" ? "Chi può votare" : "Chi può partecipare"}>
            {([
              ["all", <Users key="i" size={18} />, "Tutti",
                kind === "poll" ? `Vota chiunque. Chi non è di ${city} si conta a parte.` : "Chiunque può commentare e sostenere."],
              ["local", <Lock key="i" size={18} />, `Solo chi è di ${city}`,
                `Gli altri possono leggere${kind === "poll" ? " e vedere i risultati" : ""}. Pubblicando dichiari di essere di ${city}.`],
            ] as const).map(([id, icon, title, text]) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={audience === id}
                onClick={() => onAudience(id)}
                className={`flex w-full items-start gap-3 rounded-2xl border p-3.5 text-left transition ${
                  audience === id ? "border-pulse/60 bg-pulse/[0.07]" : "border-line bg-raised hover:border-zinc-600"
                }`}
              >
                <span className={`mt-0.5 shrink-0 ${audience === id ? "text-pulse" : "text-zinc-500"}`}>{icon}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-zinc-50">{title}</span>
                  <span className="mt-0.5 block text-xs leading-5 text-zinc-400">{text}</span>
                </span>
                <span
                  aria-hidden
                  className={`mt-1 h-4 w-4 shrink-0 rounded-full border-2 ${audience === id ? "border-pulse bg-pulse shadow-[inset_0_0_0_3px_var(--color-raised)]" : "border-zinc-600"}`}
                />
              </button>
            ))}
          </div>
        </div>
      )}
      {note && <p className="mt-2 text-xs text-no">{note}</p>}

      {picking && (
        <CityPicker
          title={kind === "poll" ? "Sondaggio per quale città?" : "Post per quale città?"}
          value={city || me?.city || null}
          confirmLabel="Scegli"
          onClose={() => setPicking(false)}
          onSelect={(c) => {
            setPicking(false);
            if (c) onChange("local", c);
          }}
        />
      )}
    </div>
  );
}

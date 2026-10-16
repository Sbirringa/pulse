import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Check, LocateFixed, MapPin, Search } from "lucide-react";
import { findPlace, loadPlaces, nearestPlace, searchPlaces, type Place } from "../../places";
import Sheet from "../social/Sheet";

const MapView = lazy(() => import("./MapView"));

/** Scegli un comune: cercandolo, con la tua posizione o toccando la mappa. */
export default function CityPicker({
  title = "Scegli la città",
  value,
  allowClear = false,
  confirmLabel = "Conferma",
  onSelect,
  onClose,
}: {
  title?: string;
  value: string | null;
  allowClear?: boolean;
  confirmLabel?: string;
  onSelect: (city: string | null) => void;
  onClose: () => void;
}) {
  const [places, setPlaces] = useState<Place[] | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [picked, setPicked] = useState<Place | null>(null);
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    loadPlaces()
      .then((list) => {
        setPlaces(list);
        setPicked(findPlace(list, value));
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Errore"));
  }, [value]);

  const results = useMemo(() => (places ? searchPlaces(places, query) : []), [places, query]);

  function useMyPosition() {
    if (!places) return;
    if (!("geolocation" in navigator)) {
      setError("Questo browser non può usare la posizione: cerca il comune per nome.");
      return;
    }
    setLocating(true);
    setError("");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        // la posizione resta qui nel telefono: serve solo a trovare il comune più vicino
        setPicked(nearestPlace(places, pos.coords.latitude, pos.coords.longitude));
        setQuery("");
      },
      () => {
        setLocating(false);
        setError("Posizione non disponibile (permesso negato?). Cerca il comune per nome.");
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 },
    );
  }

  return (
    <Sheet title={title} onClose={onClose}>
      <div className="space-y-3">
        <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-3 focus-within:border-pulse">
          <Search size={18} className="text-zinc-500" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Cerca un comune…"
            aria-label="Cerca un comune"
            className="min-w-0 flex-1 bg-transparent py-3 text-base outline-none placeholder:text-zinc-600"
          />
        </div>

        {query.trim().length >= 2 ? (
          <ul className="divide-y divide-white/5 rounded-2xl border border-white/10" role="listbox" aria-label="Comuni trovati">
            {results.length === 0 && <li className="px-4 py-3 text-sm text-zinc-500">Nessun comune trovato.</li>}
            {results.map((p) => (
              <li key={p.name}>
                <button
                  role="option"
                  aria-selected={picked?.name === p.name}
                  onClick={() => {
                    setPicked(p);
                    setQuery("");
                  }}
                  className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-white/5"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-bold">{p.name}</span>
                    <span className="block truncate text-xs text-zinc-500">
                      {p.sigla} · {p.regione}
                    </span>
                  </span>
                  <MapPin size={16} className="shrink-0 text-zinc-500" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <>
            <button
              onClick={useMyPosition}
              disabled={!places || locating}
              className="flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-left hover:border-pulse/40 disabled:opacity-50"
            >
              <LocateFixed size={18} className="text-pulse" />
              <span>
                <span className="block text-sm font-bold">{locating ? "Cerco dove sei…" : "Usa la mia posizione"}</span>
                <span className="block text-xs text-zinc-500">Resta sul tuo telefono: la usiamo solo per trovare il comune.</span>
              </span>
            </button>
            <Suspense fallback={<div className="h-56 rounded-2xl bg-white/[0.03]" />}>
              <MapView
                className="h-56"
                center={picked ? [picked.lon, picked.lat] : undefined}
                zoom={picked ? 9 : 4.6}
                selected={picked}
                onMapClick={(lat, lon) => places && setPicked(nearestPlace(places, lat, lon))}
              />
            </Suspense>
            <p className="text-center text-xs text-zinc-600">Puoi anche toccare la mappa per scegliere il comune.</p>
          </>
        )}

        {error && <p role="alert" className="rounded-xl bg-no/10 px-3 py-2 text-sm text-no">{error}</p>}

        <div className="sticky bottom-0 space-y-2 bg-panel pt-2">
          <button
            disabled={!picked}
            onClick={() => picked && onSelect(picked.name)}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-pulse py-3.5 font-extrabold text-ink hover:brightness-110 disabled:opacity-40"
          >
            <Check size={18} /> {picked ? `${confirmLabel}: ${picked.name}` : "Scegli un comune"}
          </button>
          {allowClear && (
            <button onClick={() => onSelect(null)} className="w-full py-2 text-sm font-semibold text-zinc-500 hover:text-white">
              Non indicare la città
            </button>
          )}
        </div>
      </div>
    </Sheet>
  );
}

/** Campo "città" che apre il selettore (per registrazione e impostazioni). */
export function CityField({
  value,
  onChange,
  placeholder = "Scegli la tua città",
}: {
  value: string | null;
  onChange: (city: string | null) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-1.5 flex w-full items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-left text-base hover:border-pulse/50"
      >
        <MapPin size={17} className={value ? "text-pulse" : "text-zinc-500"} />
        <span className={value ? "text-zinc-100" : "text-zinc-500"}>{value ?? placeholder}</span>
      </button>
      {open && (
        <CityPicker
          value={value}
          allowClear
          onClose={() => setOpen(false)}
          onSelect={(c) => {
            onChange(c);
            setOpen(false);
          }}
        />
      )}
    </>
  );
}

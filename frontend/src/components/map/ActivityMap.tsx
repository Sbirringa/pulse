import { lazy, Suspense, useEffect, useState } from "react";
import { MapPin } from "lucide-react";
import Sheet from "../social/Sheet";

const MapView = lazy(() => import("./MapView"));

interface Spot {
  city: string;
  posts: number;
  lat: number;
  lon: number;
}

/** La mappa dei post: dove si sta parlando adesso. Una bolla per città, più grande se c'è più movimento. */
export default function ActivityMap({ onPick, onClose }: { onPick: (city: string) => void; onClose: () => void }) {
  const [spots, setSpots] = useState<Spot[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/places/activity", { credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Non riesco a caricare la mappa."))))
      .then(setSpots)
      .catch((e) => setError(e instanceof Error ? e.message : "Errore"));
  }, []);

  return (
    <Sheet title="Dove si parla adesso" onClose={onClose}>
      <div className="space-y-4">
        <Suspense fallback={<div className="h-80 rounded-2xl bg-white/[0.03]" />}>
          <MapView
            className="h-80"
            bubbles={(spots ?? []).map((s) => ({ id: s.city, lat: s.lat, lon: s.lon, value: s.posts }))}
            onBubbleClick={onPick}
          />
        </Suspense>
        {error && <p className="text-sm text-no">{error}</p>}
        {spots?.length === 0 && (
          <p className="text-center text-sm text-zinc-500">Nessun post locale negli ultimi 60 giorni: accendi tu la mappa.</p>
        )}
        {spots && spots.length > 0 && (
          <div>
            <h3 className="mb-2 text-sm font-semibold text-zinc-400">Le città più attive</h3>
            <ul className="divide-y divide-white/5 rounded-2xl border border-white/10">
              {spots.slice(0, 12).map((s) => (
                <li key={s.city}>
                  <button onClick={() => onPick(s.city)} className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-white/5">
                    <span className="flex items-center gap-2 font-bold">
                      <MapPin size={15} className="text-pulse" /> {s.city}
                    </span>
                    <span className="text-sm text-zinc-400">
                      {s.posts} {s.posts === 1 ? "post" : "post"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Sheet>
  );
}

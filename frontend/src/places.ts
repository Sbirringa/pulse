/**
 * I 7.896 comuni italiani (fonte ISTAT, CC-BY 4.0) con coordinate, cercati direttamente nel browser:
 * nessun servizio esterno, nessuna chiave, e la tua posizione non lascia mai il telefono.
 */
export interface Place {
  name: string;
  sigla: string;
  regione: string;
  lat: number;
  lon: number;
  capoluogo: boolean;
}

let cache: Promise<Place[]> | null = null;

export function loadPlaces(): Promise<Place[]> {
  if (!cache) {
    cache = fetch("/comuni.json")
      .then((r) => {
        if (!r.ok) throw new Error("Non riesco a caricare l'elenco dei comuni.");
        return r.json();
      })
      .then((d: { items: [string, string, string, number, number, number][] }) =>
        d.items.map(([name, sigla, regione, lat, lon, capo]) => ({ name, sigla, regione, lat, lon, capoluogo: capo === 1 })),
      )
      .catch((e) => {
        cache = null; // al prossimo tentativo si riprova
        throw e;
      });
  }
  return cache;
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Ricerca istantanea: prima chi inizia con il testo (i capoluoghi in testa), poi chi lo contiene. */
export function searchPlaces(list: Place[], query: string, limit = 8): Place[] {
  const q = norm(query);
  if (q.length < 2) return [];
  const scored: [number, Place][] = [];
  for (const p of list) {
    const n = norm(p.name);
    let score = -1;
    if (n === q) score = 0;
    else if (n.startsWith(q)) score = 1;
    else if (n.split(" ").some((w) => w.startsWith(q))) score = 2; // "Bozen", "Emilia"…
    else if (q.length >= 3 && n.includes(q)) score = 3;
    if (score >= 0) scored.push([score * 2 + (p.capoluogo ? 0 : 1), p]);
  }
  scored.sort((a, b) => a[0] - b[0] || a[1].name.length - b[1].name.length || a[1].name.localeCompare(b[1].name, "it"));
  return scored.slice(0, limit).map((s) => s[1]);
}

/** Comune più vicino a un punto (per "usa la mia posizione" e per il tocco sulla mappa). */
export function nearestPlace(list: Place[], lat: number, lon: number): Place | null {
  let best: Place | null = null;
  let bestD = Infinity;
  const k = Math.cos((lat * Math.PI) / 180);
  for (const p of list) {
    const d = (p.lat - lat) ** 2 + ((p.lon - lon) * k) ** 2;
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

export function findPlace(list: Place[], name: string | null | undefined): Place | null {
  return name ? list.find((p) => p.name === name) ?? null : null;
}

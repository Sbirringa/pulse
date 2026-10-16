import { useEffect, useRef, useState } from "react";
import type { Map as MLMap, GeoJSONSource, MapMouseEvent, StyleSpecification } from "maplibre-gl";

/**
 * Mappa scura, gratuita e senza chiavi: MapLibre (open source) + OpenFreeMap (stile "Dark").
 * Se OpenFreeMap non risponde (rete, firewall, servizio giù) si passa da soli alla mappa d'Italia
 * interna (regioni e province, file /italia.json): la mappa funziona sempre.
 * Il codice della mappa (circa 1 MB) si scarica solo quando una mappa viene aperta.
 */
export const MAP_STYLE = "https://tiles.openfreemap.org/styles/dark";
export const ITALY: [number, number] = [12.5, 42.1];
// tutta l'Italia, isole comprese: la mappa si adatta al riquadro
export const ITALY_BOUNDS: [[number, number], [number, number]] = [[6.6, 36.6], [18.6, 47.1]];

export interface Bubble {
  id: string;
  lat: number;
  lon: number;
  value: number; // es. numero di post: la bolla cresce con il valore
}

type Feature = { type: "Feature"; properties: Record<string, unknown>; geometry: { type: "Point"; coordinates: [number, number] } };
const fc = (features: Feature[]) => ({ type: "FeatureCollection" as const, features });

let italiaCache: Promise<{ regions: unknown; provinces: unknown; attribution: string }> | null = null;
const loadItalia = () =>
  (italiaCache ??= fetch("/italia.json").then((r) => {
    if (!r.ok) throw new Error("mappa interna non trovata");
    return r.json();
  }));

/** Stile interno: fondo blu notte, regioni, confini di province e regioni. Nessun server esterno. */
async function localStyle(): Promise<StyleSpecification> {
  const it = await loadItalia();
  return {
    version: 8,
    sources: {
      regions: { type: "geojson", data: it.regions as never, attribution: it.attribution },
      provinces: { type: "geojson", data: it.provinces as never },
    },
    layers: [
      { id: "bg", type: "background", paint: { "background-color": "#0b0f1c" } },
      { id: "land", type: "fill", source: "regions", paint: { "fill-color": "#1a2136" } },
      { id: "prov", type: "line", source: "provinces", paint: { "line-color": "#2b3450", "line-width": 0.6 } },
      { id: "reg", type: "line", source: "regions", paint: { "line-color": "#3a4566", "line-width": 1.1 } },
    ],
  };
}

/** Lo stile di OpenFreeMap risponde? (pochi secondi, poi si usa quello interno) */
async function remoteReachable(): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const t = window.setTimeout(() => ctrl.abort(), 5000);
    const r = await fetch(MAP_STYLE, { signal: ctrl.signal });
    window.clearTimeout(t);
    if (!r.ok) return false;
    const s = await r.json();
    return s && s.version === 8 && Array.isArray(s.layers);
  } catch {
    return false;
  }
}

export default function MapView({
  center,
  zoom = 4.6,
  bubbles = [],
  selected = null,
  onMapClick,
  onBubbleClick,
  className = "h-64",
}: {
  center?: [number, number]; // senza centro: si vede tutta l'Italia
  zoom?: number;
  bubbles?: Bubble[];
  selected?: { lat: number; lon: number } | null;
  onMapClick?: (lat: number, lon: number) => void;
  onBubbleClick?: (id: string) => void;
  className?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const map = useRef<MLMap | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [simple, setSimple] = useState(false);
  const handlers = useRef({ onMapClick, onBubbleClick });
  handlers.current = { onMapClick, onBubbleClick };
  const data = useRef({ bubbles, selected });
  data.current = { bubbles, selected };

  // crea la mappa una volta sola
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const ml = await import("maplibre-gl");
        const workerUrl = (await import("maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url")).default;
        await import("maplibre-gl/dist/maplibre-gl.css");
        ml.setWorkerUrl(workerUrl);
        const remote = await remoteReachable();
        if (cancelled || !box.current) return;
        if (!remote) setSimple(true);
        const m = new ml.Map({
          container: box.current,
          style: remote ? MAP_STYLE : await localStyle(),
          ...(center ? { center, zoom } : { bounds: ITALY_BOUNDS, fitBoundsOptions: { padding: 12 } }),
          attributionControl: { compact: true },
          dragRotate: false,
          pitchWithRotate: false,
        });
        map.current = m;
        m.touchZoomRotate.disableRotation();

        // i nostri livelli (bolle e punto scelto): da rimettere se lo stile cambia
        const addOverlays = () => {
          if (m.getSource("bubbles")) return;
          m.addSource("bubbles", { type: "geojson", data: fc([]) });
          m.addSource("selected", { type: "geojson", data: fc([]) });
          m.addLayer({
            id: "bubbles",
            type: "circle",
            source: "bubbles",
            paint: {
              "circle-color": "#c8ff3d",
              "circle-opacity": 0.55,
              "circle-stroke-color": "#c8ff3d",
              "circle-stroke-width": 1.5,
              "circle-radius": ["interpolate", ["linear"], ["sqrt", ["get", "value"]], 1, 10, 10, 30],
            },
          });
          m.addLayer({ id: "selected-halo", type: "circle", source: "selected", paint: { "circle-color": "#c8ff3d", "circle-opacity": 0.2, "circle-radius": 22 } });
          m.addLayer({
            id: "selected",
            type: "circle",
            source: "selected",
            paint: { "circle-color": "#c8ff3d", "circle-radius": 8, "circle-stroke-color": "#0e1322", "circle-stroke-width": 3 },
          });
          const { bubbles: b, selected: s } = data.current;
          (m.getSource("bubbles") as GeoJSONSource).setData(
            fc(b.map((x) => ({ type: "Feature", properties: { id: x.id, value: x.value }, geometry: { type: "Point", coordinates: [x.lon, x.lat] } }))),
          );
          (m.getSource("selected") as GeoJSONSource).setData(
            fc(s ? [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [s.lon, s.lat] } }] : []),
          );
        };

        // se le tile di OpenFreeMap non arrivano (errori ripetuti, nessuna tile caricata): mappa interna
        let tileErrors = 0;
        let tilesOk = false;
        let switched = !remote;
        const switchToLocal = async () => {
          if (switched || cancelled) return;
          switched = true;
          setSimple(true);
          try {
            m.setStyle(await localStyle());
          } catch (e) {
            setFailed(e instanceof Error ? e.message : String(e));
          }
        };
        m.on("data", (e) => {
          const ev = e as { tile?: unknown; sourceId?: string };
          // contano solo le tile della mappa di base, non le nostre bolle
          if (ev.tile && ev.sourceId !== "bubbles" && ev.sourceId !== "selected") tilesOk = true;
        });
        m.on("error", (e) => {
          const msg = e?.error?.message ?? String(e);
          if (!switched && !tilesOk && ++tileErrors >= 3) {
            console.warn("Mappa: OpenFreeMap non risponde, uso la mappa interna.", msg);
            void switchToLocal();
          }
        });
        window.setTimeout(() => {
          if (!tilesOk && !switched) void switchToLocal();
        }, 12000);

        const onStyle = () => {
          addOverlays();
          setReady(true);
          // i crediti restano dietro la "i": aperti coprirebbero la Sicilia sui telefoni
          window.setTimeout(() => box.current?.querySelector(".maplibregl-ctrl-attrib")?.classList.remove("maplibregl-compact-show"), 50);
        };
        m.on("style.load", onStyle); // anche dopo il passaggio alla mappa interna
        m.on("load", onStyle);
        if (m.isStyleLoaded()) onStyle();
        m.on("click", "bubbles", (e) => {
          const id = e.features?.[0]?.properties?.id;
          if (id) handlers.current.onBubbleClick?.(String(id));
        });
        m.on("mouseenter", "bubbles", () => (m.getCanvas().style.cursor = "pointer"));
        m.on("mouseleave", "bubbles", () => (m.getCanvas().style.cursor = ""));
        m.on("click", (e: MapMouseEvent) => {
          if (m.getLayer("bubbles") && m.queryRenderedFeatures(e.point, { layers: ["bubbles"] }).length) return;
          handlers.current.onMapClick?.(e.lngLat.lat, e.lngLat.lng);
        });
      } catch (e) {
        console.warn("Mappa non disponibile:", e);
        // es. browser senza WebGL: l'app continua con la ricerca testuale
        if (!cancelled) setFailed(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // aggiorna bolle e punto selezionato
  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    (m.getSource("bubbles") as GeoJSONSource | undefined)?.setData(
      fc(bubbles.map((b) => ({ type: "Feature", properties: { id: b.id, value: b.value }, geometry: { type: "Point", coordinates: [b.lon, b.lat] } }))),
    );
  }, [bubbles, ready]);

  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    (m.getSource("selected") as GeoJSONSource | undefined)?.setData(
      fc(selected ? [{ type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [selected.lon, selected.lat] } }] : []),
    );
    if (selected) m.flyTo({ center: [selected.lon, selected.lat], zoom: Math.max(m.getZoom(), 8), duration: 700 });
  }, [selected, ready]);

  if (failed) {
    return (
      <div className={`flex flex-col items-center justify-center gap-1 rounded-2xl bg-white/[0.04] px-6 text-center ring-1 ring-white/10 ${className}`}>
        <p className="text-sm text-zinc-300">La mappa non si apre su questo dispositivo: usa la ricerca qui sopra.</p>
        <p className="text-[11px] text-zinc-500">Motivo: {failed}</p>
      </div>
    );
  }
  return (
    <div className={`relative overflow-hidden rounded-2xl bg-zinc-900 ring-1 ring-white/10 ${className}`}>
      {/* h-full w-full (non "absolute"): il CSS di MapLibre rende il contenitore "relative",
          e con "absolute inset-0" la mappa resterebbe alta 0 pixel, cioè invisibile */}
      <div ref={box} className="h-full w-full" data-testid="map" data-simple={simple ? "1" : "0"} />
      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="h-7 w-7 animate-spin rounded-full border-2 border-white/15 border-t-pulse" />
        </div>
      )}
      {simple && ready && (
        <span className="pointer-events-none absolute left-2 top-2 rounded-full bg-black/60 px-2.5 py-1 text-[11px] font-semibold text-zinc-300">
          Mappa semplificata
        </span>
      )}
    </div>
  );
}

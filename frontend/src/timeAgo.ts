const UNITS: [number, string, string][] = [
  [60, "secondo", "secondi"],
  [60, "minuto", "minuti"],
  [24, "ora", "ore"],
  [7, "giorno", "giorni"],
];

export function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  let diff = Math.max(0, (Date.now() - then) / 1000);
  if (diff < 45) return "adesso";
  for (const [size, one, many] of UNITS) {
    if (diff < size) {
      const n = Math.round(diff);
      return `${n} ${n === 1 ? one : many} fa`;
    }
    diff /= size;
  }
  return new Date(iso).toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" });
}

/** Quanto manca alla scadenza di un sondaggio: "Ancora 2 giorni", "Ancora 5 ore", "Ultimi 20 minuti". */
export function timeLeft(iso: string | null | undefined): { text: string; urgent: boolean; ended: boolean } | null {
  if (!iso) return null;
  const s = (new Date(iso).getTime() - Date.now()) / 1000;
  if (s <= 0) return { text: "Concluso", urgent: false, ended: true };
  const m = s / 60;
  const h = m / 60;
  const d = h / 24;
  if (m < 60) {
    const n = Math.max(1, Math.round(m));
    return { text: n === 1 ? "Ultimo minuto" : `Ultimi ${n} minuti`, urgent: true, ended: false };
  }
  if (h < 24) {
    const n = Math.round(h);
    return { text: n === 1 ? "Ancora 1 ora" : `Ancora ${n} ore`, urgent: h < 6, ended: false };
  }
  const n = Math.round(d);
  return { text: n === 1 ? "Ancora 1 giorno" : `Ancora ${n} giorni`, urgent: false, ended: false };
}

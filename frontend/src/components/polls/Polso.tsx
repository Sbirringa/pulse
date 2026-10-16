import type { Pct, Vote } from "../../types";

export const STANCES: { v: Vote; key: keyof Pct; label: string; plural: string; bg: string; text: string; ring: string }[] = [
  { v: 1, key: "yes", label: "Favorevole", plural: "Favorevoli", bg: "bg-yes", text: "text-yes", ring: "ring-yes" },
  { v: 0, key: "depends", label: "Dipende", plural: "Dipende", bg: "bg-maybe", text: "text-maybe", ring: "ring-maybe" },
  { v: -1, key: "no", label: "Contrario", plural: "Contrari", bg: "bg-no", text: "text-no", ring: "ring-no" },
];

/**
 * Il polso: come la pensano le persone, in una barra a tre colori.
 * Senza percentuali (prima di votare) è una striscia "da scoprire".
 */
export default function Polso({
  pct,
  mine = null,
  size = "md",
  legend = true,
  animate = true,
}: {
  pct: Pct | null;
  mine?: Vote | null;
  size?: "sm" | "md" | "lg";
  legend?: boolean;
  animate?: boolean;
}) {
  const h = size === "lg" ? "h-4" : size === "sm" ? "h-2" : "h-3";
  if (!pct) {
    return <div className={`stripes w-full rounded-full ${h}`} aria-hidden />;
  }
  const total = pct.yes + pct.depends + pct.no;
  const label = STANCES.map((s) => `${s.plural} ${pct[s.key]}%`).join(", ");
  return (
    <div>
      <div className={`flex w-full gap-[3px] overflow-hidden rounded-full ${h} ${animate ? "fill" : ""}`} role="img" aria-label={label}>
        {total === 0 ? (
          <div className="h-full w-full rounded-full bg-white/10" />
        ) : (
          STANCES.filter((s) => pct[s.key] > 0).map((s) => (
            <div key={s.key} className={`h-full ${s.bg}`} style={{ width: `${pct[s.key]}%` }} />
          ))
        )}
      </div>
      {legend && (
        <div className="mt-3 grid grid-cols-3 gap-2">
          {STANCES.map((s) => (
            <div key={s.key} className={s.v === 0 ? "text-center" : s.v === -1 ? "text-right" : ""}>
              <p className={`font-display tabular font-bold leading-none ${size === "lg" ? "text-4xl" : size === "sm" ? "text-lg" : "text-2xl"} ${s.text}`}>
                {pct[s.key]}%
              </p>
              <p className="mt-1 text-xs text-zinc-400">
                {s.plural}
                {mine === s.v && <span className="ml-1.5 rounded-md bg-white/10 px-1.5 py-px text-[11px] font-bold text-zinc-100">tu</span>}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

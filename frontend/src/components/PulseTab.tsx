import { useEffect, useState } from "react";
import { Flame, ImageDown } from "lucide-react";
import { api, errMsg } from "../api";
import type { Me, PulseData } from "../types";
import { renderPulseCard } from "../shareCard";
import { shareImage } from "../share";

const MINE_LABEL: Record<number, { text: string; cls: string }> = {
  1: { text: "Favorevole", cls: "bg-pulse/15 text-pulse" },
  0: { text: "Dipende", cls: "bg-maybe/15 text-maybe" },
  [-1]: { text: "Contrario", cls: "bg-rose-400/15 text-no" },
};

export default function PulseTab({
  me,
  refreshKey,
}: {
  me: Me;
  refreshKey: number;
}) {
  const [data, setData] = useState<PulseData | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    api.pulse().then(setData).catch((e) => setError(errMsg(e)));
  }, [refreshKey]);

  async function makeCard() {
    if (!data) return;
    setBusy(true);
    setNote("");
    try {
      const blob = await renderPulseCard(data, me.nickname);
      const r = await shareImage(blob, "il-mio-pulse.png", "Come la penso su PULSE. E tu?");
      setNote(r === "downloaded" ? "Card salvata: condividila dove vuoi." : "");
    } catch (e) {
      setNote(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  if (error) return <p className="py-10 text-center text-sm text-no">{error}</p>;
  if (!data) return <p className="py-20 text-center text-sm text-zinc-500">Carico le tue risposte…</p>;

  return (
    <div className="rise space-y-6">
      <section className="overflow-hidden rounded-[2rem] border border-white/10 bg-panel ring-1 ring-white/[0.07] p-6">
        <p className="text-sm font-semibold text-pulse">Le tue risposte</p>
        {data.aligned_pct !== null ? (
          <>
            <p className="mt-4 text-7xl font-black tracking-tighter text-pulse">{data.aligned_pct}%</p>
            <p className="mt-2 text-base font-bold">in sintonia con gli altri partecipanti</p>
            <p className="mt-1 text-xs text-zinc-500">
              Calcolato su {data.comparable} {data.comparable === 1 ? "questione" : "questioni"} con almeno{" "}
              {data.min_results} voti.
            </p>
          </>
        ) : (
          <>
            <p className="mt-4 text-7xl font-black tracking-tighter text-pulse">{data.answered}</p>
            <p className="mt-2 text-base font-bold">
              {data.answered === 1 ? "questione a cui hai risposto" : "questioni a cui hai risposto"}
            </p>
            <p className="mt-1 text-xs text-zinc-500">
              Il confronto con gli altri compare quando le questioni raccolgono almeno {data.min_results} voti.
            </p>
          </>
        )}

        <div className="mt-6 grid grid-cols-2 gap-3">
          <div className="rounded-2xl bg-white/[0.05] p-4">
            <p className="text-3xl font-black">{data.answered}</p>
            <p className="text-xs text-zinc-400">risposte</p>
          </div>
          <div className="rounded-2xl bg-white/[0.05] p-4">
            <p className="flex items-center gap-1.5 text-3xl font-black">
              {data.streak > 0 && <Flame size={24} className="text-amber-300" />}
              {data.streak}
            </p>
            <p className="text-xs text-zinc-400">{data.streak === 1 ? "giorno di fila" : "giorni di fila"}</p>
          </div>
        </div>

        {data.categories.length > 0 && (
          <div className="mt-5 flex flex-wrap gap-2">
            {data.categories.slice(0, 4).map((c) => (
              <span key={c.category} className="rounded-full border border-pulse/40 px-3 py-1 text-xs font-bold text-pulse">
                {c.category} · {c.answered}
              </span>
            ))}
          </div>
        )}

        <button
          onClick={makeCard}
          disabled={busy || data.answered === 0}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-pulse py-3.5 font-extrabold text-ink hover:brightness-110 disabled:opacity-40"
        >
          <ImageDown size={19} /> {busy ? "Creo la card…" : "Crea la card da condividere"}
        </button>
        {data.answered === 0 && <p className="mt-2 text-center text-xs text-zinc-500">Rispondi ad almeno una questione.</p>}
        {note && <p className="mt-2 text-center text-xs text-pulse">{note}</p>}
      </section>

      {data.recent.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-zinc-400">Le tue ultime risposte</h2>
          <ul className="space-y-2.5">
            {data.recent.map((r) => (
              <li key={r.question_id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm font-semibold leading-snug">{r.title}</p>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${MINE_LABEL[r.mine].cls}`}>
                    {MINE_LABEL[r.mine].text}
                  </span>
                </div>
                <p className="mt-2 text-xs text-zinc-500">
                  {r.category} · {r.total} {r.total === 1 ? "voto" : "voti"}{r.pct ? ` · ${r.pct.yes}% favorevoli · ${r.pct.no}% contrari` : " · risultati quando votano più persone"}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}

    </div>
  );
}

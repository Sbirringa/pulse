import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { api, errMsg } from "../../api";
import type { Poll } from "../../types";
import PollCard from "./PollCard";

/** Un sondaggio da solo (link condiviso /q/123, notifica "sondaggio concluso"). */
export default function PollDetail({ id, onBack, onMore }: { id: number; onBack: () => void; onMore: () => void }) {
  const [poll, setPoll] = useState<Poll | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    window.scrollTo(0, 0);
    api.poll(id).then(setPoll).catch((e) => setError(errMsg(e)));
  }, [id]);

  return (
    <div className="rise space-y-4">
      <button onClick={onBack} className="flex items-center gap-1.5 text-sm font-semibold text-zinc-400 hover:text-white">
        <ArrowLeft size={17} /> Indietro
      </button>
      {error && <p className="rounded-xl bg-no/10 px-3 py-2 text-sm text-no">{error}</p>}
      {!poll && !error && <p className="py-12 text-center text-sm text-zinc-500">Carico il sondaggio…</p>}
      {poll && <PollCard key={poll.id} poll={poll} full onDeleted={onBack} />}
      {(poll || error) && (
        <button onClick={onMore} className="w-full rounded-2xl py-3.5 text-sm font-semibold text-zinc-300 ring-1 ring-white/10 hover:text-white">
          Vedi tutti i sondaggi
        </button>
      )}
    </div>
  );
}

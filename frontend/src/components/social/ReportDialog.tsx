import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import { Flag, X } from "lucide-react";
import { api, errMsg } from "../../api";
import type { ReportReason } from "../../types";

let cachedReasons: ReportReason[] | null = null;

export default function ReportDialog({
  targetType,
  target,
  onClose,
  onDone,
}: {
  targetType: "post" | "comment" | "question" | "argument" | "user";
  target: number | string;
  onClose: () => void;
  onDone: (hidden: boolean) => void;
}) {
  const [reasons, setReasons] = useState<ReportReason[]>(cachedReasons ?? []);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (cachedReasons) return;
    api
      .reportReasons()
      .then((r) => {
        cachedReasons = r;
        setReasons(r);
      })
      .catch((e) => setError(errMsg(e)));
  }, []);

  async function send() {
    setBusy(true);
    setError("");
    try {
      const r = await api.report(targetType, target, reason);
      onDone(r.hidden);
    } catch (e) {
      setError(errMsg(e));
      setBusy(false);
    }
  }

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Segnala" className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="rise w-full max-w-md rounded-t-3xl border border-white/10 bg-panel p-5 sm:rounded-3xl">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-extrabold">
            <Flag size={18} className="text-no" /> Segnala {targetType === "post" ? "il post" : targetType === "user" ? "il profilo" : targetType === "question" ? "il sondaggio" : targetType === "argument" ? "la ragione" : "il commento"}
          </h2>
          <button onClick={onClose} aria-label="Chiudi" className="rounded-full p-1.5 text-zinc-400 hover:bg-white/10">
            <X size={20} />
          </button>
        </div>
        <p className="mt-1 text-sm text-zinc-400">La segnalazione è anonima. Con 3 segnalazioni il contenuto si nasconde da solo.</p>
        <div className="mt-4 space-y-2">
          {reasons.map((r) => (
            <label key={r.id} className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm ${reason === r.id ? "border-pulse bg-pulse/10" : "border-white/10"}`}>
              <input type="radio" name="reason" value={r.id} checked={reason === r.id} onChange={() => setReason(r.id)} className="accent-[#c8ff3d]" />
              {r.label}
            </label>
          ))}
        </div>
        {error && <p role="alert" className="mt-3 rounded-xl bg-no/10 px-3 py-2 text-sm text-no">{error}</p>}
        <button
          disabled={!reason || busy}
          onClick={send}
          className="mt-4 w-full rounded-xl bg-rose-500 py-3 font-extrabold text-white hover:bg-rose-400 disabled:opacity-40"
        >
          {busy ? "Invio…" : "Invia segnalazione"}
        </button>
      </div>
    </div>,
    document.body,
  );
}

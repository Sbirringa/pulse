import { useCallback, useEffect, useState } from "react";
import { Ban, CheckCircle2, EyeOff, Image as ImageIcon, RotateCcw, ShieldCheck, Trash2 } from "lucide-react";
import { api, errMsg } from "../api";
import { confirmDialog } from "../confirm";
import type { AdminItem } from "../types";
import { useNav } from "../nav";
import Lightbox from "./Lightbox";

const KIND: Record<AdminItem["type"], string> = { post: "Post", comment: "Commento", question: "Sondaggio", argument: "Ragione", user: "Profilo" };
const REASON: Record<string, string> = {
  spam: "Spam", odio: "Odio/insulti", illegale: "Illegale", privacy: "Privacy", identita: "Furto d'identità", falso: "Falso", altro: "Altro",
};

/**
 * Moderazione per l'amministratore, dentro l'app. Qui arriva solo ciò che le persone hanno segnalato:
 * sopra le 3 segnalazioni il contenuto è già nascosto in automatico, tu decidi se ripristinarlo o eliminarlo.
 */
export default function AdminPanel({ onCount }: { onCount?: (n: number) => void }) {
  const { openPost } = useNav();
  const [items, setItems] = useState<AdminItem[] | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [photo, setPhoto] = useState<string | null>(null);

  const load = useCallback(() => {
    api
      .adminReports()
      .then((r) => {
        setItems(r);
        onCount?.(r.length);
      })
      .catch((e) => setError(errMsg(e)));
  }, [onCount]);

  useEffect(() => load(), [load]);

  async function act(it: AdminItem, action: "restore" | "remove" | "reset" | "ban") {
    const key = `${it.type}-${it.id}-${it.author}`;
    if (action === "ban" && !(await confirmDialog({ title: `Bannare @${it.author}?`, detail: "Vengono eliminati anche TUTTI i suoi contenuti.", yes: "Banna", danger: true }))) return;
    if (action === "remove" && !(await confirmDialog({ title: `Eliminare questo ${KIND[it.type].toLowerCase()}?`, detail: "Sparisce per tutti, definitivamente.", yes: "Elimina", danger: true }))) return;
    setBusy(key);
    try {
      if (action === "ban") await api.adminBan(it.author!, true);
      else if (it.type === "user") await api.adminProfile(it.author!, action === "reset" ? "reset" : "restore");
      else await api.adminContent(it.type, it.id, action === "restore" ? "restore" : "remove");
      load();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rise space-y-4">
      <div className="rounded-3xl border border-pulse/30 bg-pulse/5 p-4">
        <p className="flex items-center gap-2 text-sm font-bold">
          <ShieldCheck size={17} className="text-pulse" /> Moderazione automatica attiva
        </p>
        <p className="mt-1 text-xs leading-5 text-zinc-400">
          Post, commenti e sondaggi si pubblicano subito. Con 3 segnalazioni si nascondono da soli. Qui trovi solo
          quello che è stato segnalato: decidi tu se ripristinarlo o eliminarlo.
        </p>
      </div>

      {error && <p className="rounded-xl bg-no/10 px-3 py-2 text-sm text-no">{error}</p>}
      {items === null && !error && <p className="py-8 text-center text-sm text-zinc-500">Carico le segnalazioni…</p>}
      {items?.length === 0 && (
        <div className="card p-8 text-center">
          <CheckCircle2 className="mx-auto text-pulse" size={34} />
          <p className="mt-3 font-extrabold">Tutto tranquillo.</p>
          <p className="mt-1 text-sm text-zinc-400">Nessuna segnalazione da controllare.</p>
        </div>
      )}

      {items?.map((it) => {
        const key = `${it.type}-${it.id}-${it.author}`;
        const hidden = it.status === "hidden";
        return (
          <article key={key} className="card p-4">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full bg-white/10 px-2.5 py-1 font-bold">{KIND[it.type]}</span>
              {hidden && (
                <span className="flex items-center gap-1 rounded-full bg-maybe/15 px-2.5 py-1 font-bold text-maybe">
                  <EyeOff size={12} /> Nascosto in automatico
                </span>
              )}
              <span className="text-zinc-500">
                {it.reports} {it.reports === 1 ? "segnalazione" : "segnalazioni"}
                {Object.keys(it.reasons).length > 0 &&
                  ": " + Object.entries(it.reasons).map(([k, v]) => `${REASON[k] ?? k} ×${v}`).join(", ")}
              </span>
            </div>
            <p className="mt-2 text-xs text-zinc-500">
              di {it.author ? `@${it.author}` : "account eliminato"}
              {it.author_banned && " · già bannato"}
            </p>
            <p className="mt-2 line-clamp-6 whitespace-pre-wrap break-words text-sm leading-6">{it.body || "(nessun testo)"}</p>
            {it.images.length > 0 && (
              <div className="mt-3 flex gap-2">
                {it.images.map((id) => (
                  <button
                    key={id}
                    onClick={() => setPhoto(`/api/admin/media/${id}/${it.type === "user" ? "av" : "lg"}`)}
                    className="flex items-center gap-1.5 rounded-full border border-white/15 px-3 py-1.5 text-xs font-bold hover:bg-white/5"
                  >
                    <ImageIcon size={14} /> Vedi foto
                  </button>
                ))}
              </div>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <button disabled={busy === key} onClick={() => act(it, "restore")} className="flex items-center gap-1.5 rounded-full border border-white/20 px-3.5 py-2 text-xs font-bold hover:bg-white/5 disabled:opacity-50">
                <RotateCcw size={14} /> {hidden ? "Ripristina" : "Va bene così"}
              </button>
              {it.type === "user" ? (
                <button disabled={busy === key} onClick={() => act(it, "reset")} className="flex items-center gap-1.5 rounded-full bg-rose-500 px-3.5 py-2 text-xs font-extrabold text-white hover:bg-rose-400 disabled:opacity-50">
                  <Trash2 size={14} /> Cancella nome, bio e foto
                </button>
              ) : (
                <button disabled={busy === key} onClick={() => act(it, "remove")} className="flex items-center gap-1.5 rounded-full bg-rose-500 px-3.5 py-2 text-xs font-extrabold text-white hover:bg-rose-400 disabled:opacity-50">
                  <Trash2 size={14} /> Elimina
                </button>
              )}
              {it.author && !it.author_banned && (
                <button disabled={busy === key} onClick={() => act(it, "ban")} className="flex items-center gap-1.5 rounded-full border border-rose-400/40 px-3.5 py-2 text-xs font-bold text-no hover:bg-no/10 disabled:opacity-50">
                  <Ban size={14} /> Banna autore
                </button>
              )}
              {it.post_id && it.type !== "user" && (
                <button onClick={() => openPost(it.post_id!)} className="px-2 py-2 text-xs font-semibold text-zinc-400 underline hover:text-white">
                  Apri nel contesto
                </button>
              )}
            </div>
          </article>
        );
      })}
      {photo && (
        <Lightbox images={[{ id: photo, w: 1600, h: 1200, sm: photo, lg: photo }]} caption="Foto segnalata" onClose={() => setPhoto(null)} />
      )}
    </div>
  );
}

import { createPortal } from "react-dom";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { CornerDownRight, Flag, Image as ImageIcon, ImagePlus, Send, Trash2, X } from "lucide-react";
import { api, errMsg } from "../../api";
import { confirmDialog } from "../../confirm";
import type { CommentItem, ImageRef, Thread } from "../../types";
import { ACCEPTED, prepareImage } from "../../imageResize";
import { timeAgo } from "../../timeAgo";
import { useNav } from "../../nav";
import { AuthorAvatar, AuthorName } from "./AuthorLine";
import Lightbox from "../Lightbox";
import DeclareCity from "./DeclareCity";
import ReportDialog from "./ReportDialog";

const MAX_CHARS = 1000;
const REPLIES_PREVIEW = 3;

interface ReplyTarget {
  id: number;
  author: string;
  name?: string | null;
}

/** La foto di un commento NON viene mostrata intera: solo una piccola icona "Foto" che la apre. */
function PhotoChip({ image, author, onOpen }: { image: ImageRef; author: string | null; onOpen: (img: ImageRef, caption: string) => void }) {
  return (
    <button
      onClick={() => onOpen(image, author ? `Foto di ${author}` : "Foto")}
      aria-label={author ? `Apri la foto di ${author}` : "Apri la foto"}
      className="mt-1.5 inline-flex items-center gap-1.5 rounded-full border border-pulse/40 bg-pulse/10 px-2.5 py-1 text-xs font-bold text-pulse transition hover:bg-pulse/20"
    >
      <ImageIcon size={14} /> Foto
    </button>
  );
}

function CommentRow({
  c,
  isReply,
  highlight,
  onReply,
  onOpenImage,
  onChanged,
}: {
  c: CommentItem;
  isReply: boolean;
  highlight: boolean;
  onReply: (t: ReplyTarget) => void;
  onOpenImage: (img: ImageRef, caption: string) => void;
  onChanged: () => void;
}) {
  const { me, requireAuth } = useNav();
  const [reporting, setReporting] = useState(false);
  const [note, setNote] = useState("");

  if (c.status !== "visible") {
    return (
      <p className={`py-2 text-sm italic text-zinc-600 ${isReply ? "" : "pl-1"}`}>
        {c.status === "deleted" ? "Commento eliminato" : "Commento nascosto in attesa di revisione"}
      </p>
    );
  }

  async function adminRemove() {
    if (!(await confirmDialog({ title: "Eliminare il commento?", detail: "Lo elimini come amministratore: sparisce per tutti.", yes: "Elimina", danger: true }))) return;
    try {
      await api.adminContent("comment", c.id, "remove");
      onChanged();
    } catch (e) {
      setNote(errMsg(e));
    }
  }

  async function remove() {
    if (!(await confirmDialog({ title: "Eliminare il commento?", detail: "Non si può annullare.", yes: "Elimina", danger: true }))) return;
    try {
      await api.deleteComment(c.id);
      onChanged();
    } catch (e) {
      setNote(errMsg(e));
    }
  }

  return (
    <div id={`c-${c.id}`} className={`flex gap-2.5 rounded-xl py-2 transition-colors ${highlight ? "bg-pulse/10" : ""}`}>
      <AuthorAvatar nickname={c.author} name={c.author_name} avatar={c.author_avatar} size={isReply ? 28 : 34} />
      <div className="min-w-0 flex-1">
        <p className="flex min-w-0 items-baseline gap-1.5 text-xs">
          {c.author && <AuthorName nickname={c.author} name={c.author_name} small />}
          <span className="shrink-0 text-zinc-500">{timeAgo(c.created_at)}</span>
        </p>
        {(c.body || c.reply_to) && (
          <p className="mt-0.5 whitespace-pre-wrap break-words text-sm leading-5 text-zinc-200">
            {c.reply_to && <span className="mr-1 font-semibold text-pulse">@{c.reply_to}</span>}
            {c.body}
          </p>
        )}
        {c.image && <PhotoChip image={c.image} author={c.author_name ?? (c.author ? `@${c.author}` : null)} onOpen={onOpenImage} />}
        <div className="mt-1 flex items-center gap-4 text-xs font-semibold text-zinc-500">
          <button
            onClick={() => (me ? onReply({ id: c.id, author: c.author ?? "", name: c.author_name }) : requireAuth("Entra per rispondere"))}
            className="hover:text-white"
          >
            Rispondi
          </button>
          {me?.is_admin && !c.mine && (
            <button onClick={adminRemove} className="flex items-center gap-1 text-no/80 hover:text-no">
              <Trash2 size={12} /> Elimina (admin)
            </button>
          )}
          {c.mine ? (
            <button onClick={remove} className="flex items-center gap-1 hover:text-no">
              <Trash2 size={12} /> Elimina
            </button>
          ) : (
            <button disabled={c.reported} onClick={() => (me ? setReporting(true) : requireAuth("Entra per segnalare un contenuto"))} className="flex items-center gap-1 hover:text-no disabled:opacity-50">
              <Flag size={12} /> {c.reported ? "Segnalato" : "Segnala"}
            </button>
          )}
        </div>
        {note && <p className="mt-1 text-xs text-zinc-400">{note}</p>}
      </div>
      {reporting && (
        <ReportDialog
          targetType="comment"
          target={c.id}
          onClose={() => setReporting(false)}
          onDone={(hidden) => {
            setReporting(false);
            setNote(hidden ? "Grazie: il commento è stato nascosto." : "Grazie, segnalazione inviata.");
            onChanged();
          }}
        />
      )}
    </div>
  );
}

function ThreadView({
  t,
  highlightId,
  onReply,
  onOpenImage,
  onChanged,
}: {
  t: Thread;
  highlightId: number | null;
  onReply: (r: ReplyTarget) => void;
  onOpenImage: (img: ImageRef, caption: string) => void;
  onChanged: () => void;
}) {
  const [showAll, setShowAll] = useState(false);
  const hiddenCount = t.replies.length - REPLIES_PREVIEW;
  // se ho appena risposto in fondo al thread, la mia risposta deve essere visibile
  const forceAll = highlightId !== null && t.replies.slice(REPLIES_PREVIEW).some((r) => r.id === highlightId);
  const replies = showAll || forceAll ? t.replies : t.replies.slice(0, REPLIES_PREVIEW);
  return (
    <li className="border-b border-white/5 pb-2 last:border-0">
      <CommentRow c={t} isReply={false} highlight={highlightId === t.id} onReply={onReply} onOpenImage={onOpenImage} onChanged={onChanged} />
      {t.replies.length > 0 && (
        <div className="ml-4 border-l-2 border-white/10 pl-3">
          {replies.map((r) => (
            <CommentRow key={r.id} c={r} isReply highlight={highlightId === r.id} onReply={onReply} onOpenImage={onOpenImage} onChanged={onChanged} />
          ))}
          {hiddenCount > 0 && !showAll && !forceAll && (
            <button onClick={() => setShowAll(true)} className="flex items-center gap-1.5 py-1.5 text-xs font-bold text-zinc-400 hover:text-white">
              <CornerDownRight size={14} /> Mostra altre {hiddenCount} {hiddenCount === 1 ? "risposta" : "risposte"}
            </button>
          )}
        </div>
      )}
    </li>
  );
}

function CommentComposer({
  postId,
  replyTo,
  onCancelReply,
  onSent,
}: {
  postId: number;
  replyTo: ReplyTarget | null;
  onCancelReply: () => void;
  onSent: (c: CommentItem) => void;
}) {
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (replyTo) textRef.current?.focus();
  }, [replyTo]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!text.trim() && !file) return;
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.append("body", text);
      if (replyTo) form.append("reply_to", String(replyTo.id));
      if (file) form.append("image", await prepareImage(file));
      const created = await api.createComment(postId, form);
      setText("");
      setFile(null);
      onSent(created);
    } catch (err) {
      setError(errMsg(err));
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    <form
      onSubmit={submit}
      className="fixed inset-x-0 z-20 border-t border-white/10 bg-ink/95 px-4 pb-3 pt-2 backdrop-blur-xl"
      style={{ bottom: "calc(4.25rem + env(safe-area-inset-bottom))" }}
    >
      <div className="mx-auto max-w-md sm:max-w-xl">
        {replyTo && (
          <div className="mb-2 flex items-center justify-between rounded-lg bg-white/5 px-3 py-1.5 text-xs text-zinc-300">
            <span>
              Rispondi a <strong className="text-pulse">{replyTo.name ?? `@${replyTo.author}`}</strong>
            </span>
            <button type="button" onClick={onCancelReply} aria-label="Annulla risposta" className="p-0.5 text-zinc-400 hover:text-white">
              <X size={14} />
            </button>
          </div>
        )}
        {file && (
          <div className="mb-2 inline-flex max-w-full items-center gap-2 rounded-full border border-pulse/40 bg-pulse/10 py-1 pl-3 pr-1.5 text-xs font-bold text-pulse">
            <ImageIcon size={14} />
            <span className="truncate">Foto allegata</span>
            <button type="button" onClick={() => setFile(null)} aria-label="Rimuovi foto" className="rounded-full p-0.5 hover:bg-pulse/20">
              <X size={14} />
            </button>
          </div>
        )}
        {error && <p role="alert" className="mb-2 text-xs text-no">{error}</p>}
        <div className="flex items-end gap-2">
          <input
            ref={input}
            type="file"
            accept={ACCEPTED}
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) setFile(f);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => input.current?.click()}
            aria-label="Allega una foto"
            title="Allega una foto"
            className={`shrink-0 rounded-full p-2.5 transition ${file ? "bg-pulse/20 text-pulse" : "text-zinc-400 hover:bg-white/10 hover:text-white"}`}
          >
            <ImagePlus size={21} />
          </button>
          <textarea
            ref={textRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={MAX_CHARS}
            rows={1}
            placeholder={replyTo ? `Rispondi a @${replyTo.author}…` : "Scrivi un commento…"}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && window.matchMedia("(pointer: fine)").matches) {
                e.preventDefault();
                e.currentTarget.form?.requestSubmit();
              }
            }}
            className="max-h-32 min-h-[2.75rem] flex-1 resize-none rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2.5 text-[15px] leading-5 outline-none placeholder:text-zinc-600 focus:border-pulse"
          />
          <button
            disabled={busy || (!text.trim() && !file)}
            aria-label="Invia commento"
            className="shrink-0 rounded-full bg-pulse p-2.5 text-ink transition hover:brightness-110 disabled:opacity-30"
          >
            <Send size={20} />
          </button>
        </div>
      </div>
    </form>,
    document.body,
  );
}

function GuestCommentBar({ onJoin }: { onJoin: () => void }) {
  return createPortal(
    <div
      className="fixed inset-x-0 z-20 border-t border-white/10 bg-ink/95 px-4 py-3 backdrop-blur-xl"
      style={{ bottom: "calc(4.25rem + env(safe-area-inset-bottom))" }}
    >
      <button onClick={onJoin} className="mx-auto flex w-full max-w-md items-center sm:max-w-xl justify-between rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-left text-[15px] text-zinc-500">
        Scrivi un commento…
        <span className="rounded-full bg-pulse px-3 py-1 text-xs font-extrabold text-ink">Entra</span>
      </button>
    </div>,
    document.body,
  );
}

function LocalCommentBar({ city, onDeclare }: { city: string; onDeclare: () => void }) {
  return createPortal(
    <div
      className="fixed inset-x-0 z-20 border-t border-line bg-ink/95 px-4 py-3 backdrop-blur-xl"
      style={{ bottom: "calc(4.25rem + env(safe-area-inset-bottom))" }}
    >
      <div className="mx-auto flex w-full max-w-md items-center justify-between gap-3 rounded-2xl border border-line bg-raised px-4 py-3 sm:max-w-xl lg:max-w-[640px]">
        <span className="text-sm text-zinc-400">Commentano solo le persone di {city}</span>
        <button onClick={onDeclare} className="shrink-0 rounded-full bg-pulse px-3.5 py-1.5 text-xs font-bold text-ink">
          Sono di {city}
        </button>
      </div>
    </div>,
    document.body,
  );
}

export default function Comments({
  postId,
  onCountChange,
  localCity,
}: {
  postId: number;
  onCountChange: (n: number) => void;
  /** post riservato a una città di cui non sei: si legge, per commentare si dichiara la città */
  localCity?: string | null;
}) {
  const { me, requireAuth } = useNav();
  const [declaring, setDeclaring] = useState(false);
  const [threads, setThreads] = useState<Thread[] | null>(null);
  const [error, setError] = useState("");
  const [replyTo, setReplyTo] = useState<ReplyTarget | null>(null);
  const [lightbox, setLightbox] = useState<{ img: ImageRef; caption: string } | null>(null);
  const [highlight, setHighlight] = useState<number | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await api.comments(postId);
      setThreads(data.threads);
      onCountChange(data.total);
      setError("");
    } catch (e) {
      setError(errMsg(e));
    }
  }, [postId, onCountChange]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onSent(c: CommentItem) {
    setReplyTo(null);
    setHighlight(c.id);
    await load();
    requestAnimationFrame(() => document.getElementById(`c-${c.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
    window.setTimeout(() => setHighlight(null), 2500);
  }

  const openImage = useCallback((img: ImageRef, caption: string) => setLightbox({ img, caption }), []);

  return (
    <section className="mt-6 pb-36">
      <h2 className="mb-2 text-sm font-semibold text-zinc-400">Commenti</h2>
      {error && <p className="text-sm text-no">{error}</p>}
      {threads === null && !error && <p className="py-6 text-center text-sm text-zinc-500">Carico i commenti…</p>}
      {threads?.length === 0 && (
        <p className="py-6 text-center text-sm text-zinc-500">Ancora nessun commento. Inizia tu la conversazione.</p>
      )}
      <ul className="space-y-2">
        {threads?.map((t) => (
          <ThreadView key={t.id} t={t} highlightId={highlight} onReply={setReplyTo} onOpenImage={openImage} onChanged={load} />
        ))}
      </ul>
      {me && localCity ? (
        <LocalCommentBar city={localCity} onDeclare={() => setDeclaring(true)} />
      ) : me ? (
        <CommentComposer postId={postId} replyTo={replyTo} onCancelReply={() => setReplyTo(null)} onSent={onSent} />
      ) : (
        <GuestCommentBar onJoin={() => requireAuth("Entra per commentare, anche con una foto")} />
      )}
      {lightbox && <Lightbox images={[lightbox.img]} caption={lightbox.caption} onClose={() => setLightbox(null)} />}
      {declaring && localCity && <DeclareCity city={localCity} onClose={() => setDeclaring(false)} onDone={() => setDeclaring(false)} />}
    </section>
  );
}

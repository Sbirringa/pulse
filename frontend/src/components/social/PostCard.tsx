import { useState } from "react";
import { ArrowRight, BarChart3, EyeOff, Flag, Hand, Lightbulb, MapPin, MessageCircle, MoreHorizontal, Share2, Trash2, Users } from "lucide-react";
import { api, errMsg } from "../../api";
import type { ImageRef, Post } from "../../types";
import { timeAgo } from "../../timeAgo";
import { useNav } from "../../nav";
import { AuthorAvatar, AuthorName } from "./AuthorLine";
import { shareLink } from "../../share";
import ActionSheet, { type Action } from "../ActionSheet";
import Lightbox from "../Lightbox";
import ReportDialog from "./ReportDialog";
import DeclareCity, { LocalOnly, isLocal } from "./DeclareCity";

function ImageGrid({ images, onOpen }: { images: ImageRef[]; onOpen: (i: number) => void }) {
  const n = images.length;
  if (n === 0) return null;
  const cell = (img: ImageRef, i: number, cls: string) => (
    <button
      key={img.id}
      onClick={(e) => {
        e.stopPropagation();
        onOpen(i);
      }}
      aria-label={`Apri foto ${i + 1} di ${n}`}
      className={`relative overflow-hidden bg-zinc-800 ${cls}`}
    >
      <img src={img.sm} alt="" loading="lazy" className="h-full w-full object-cover transition hover:scale-[1.02]" />
    </button>
  );
  if (n === 1) {
    const img = images[0];
    const ratio = Math.min(1.25, Math.max(0.6, img.h / img.w)); // né troppo alta né troppo bassa
    return (
      <div className="mt-3 overflow-hidden rounded-2xl" style={{ aspectRatio: `1 / ${ratio}` }}>
        {cell(img, 0, "h-full w-full")}
      </div>
    );
  }
  if (n === 3) {
    return (
      <div className="mt-3 grid aspect-[4/3] grid-cols-2 grid-rows-2 gap-1 overflow-hidden rounded-2xl">
        {cell(images[0], 0, "row-span-2")}
        {cell(images[1], 1, "")}
        {cell(images[2], 2, "")}
      </div>
    );
  }
  return (
    <div className={`mt-3 grid gap-1 overflow-hidden rounded-2xl ${n === 2 ? "aspect-[2/1] grid-cols-2" : "aspect-square grid-cols-2 grid-rows-2"}`}>
      {images.map((img, i) => cell(img, i, ""))}
    </div>
  );
}

export default function PostCard({
  post,
  full = false,
  onOpen,
  onDeleted,
  onChanged,
}: {
  post: Post;
  full?: boolean;
  onOpen?: () => void;
  onDeleted: () => void;
  onChanged: (p: Post) => void;
}) {
  const { me, requireAuth, openPoll } = useNav();
  const [supporting, setSupporting] = useState(false);
  const [declaring, setDeclaring] = useState(false);
  // post di una città riservato a chi è di lì: gli altri leggono, e per partecipare dichiarano la città
  const restricted = post.scope === "local" && post.audience === "local" && !post.mine && !isLocal(me, post.city);
  const proposal = post.kind === "proposal";
  const goal = post.goal ?? 20;

  // "Anch'io" sui post, "Sostengo" sulle proposte: un tocco per aggiungersi, un altro per togliersi
  async function toggleSupport() {
    if (!me) {
      requireAuth(proposal ? "Entra per sostenere la proposta" : "Entra per dire «Anch'io»");
      return;
    }
    if (post.mine || supporting || post.poll_id) return;
    if (restricted) {
      setDeclaring(true);
      return;
    }
    setSupporting(true);
    const on = !post.supported;
    onChanged({ ...post, supported: on, supports: post.supports + (on ? 1 : -1) });
    try {
      onChanged(await api.supportPost(post.id, on));
    } catch (e) {
      onChanged(post);
      setNote(errMsg(e));
    } finally {
      setSupporting(false);
    }
  }
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [menu, setMenu] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [expanded, setExpanded] = useState(full);
  const [note, setNote] = useState("");
  const long = post.body.length > 280;

  async function share() {
    const r = await shareLink({ title: "Pulse", text: post.body.slice(0, 80) || "Un post su Pulse", path: `/p/${post.id}` });
    if (r === "copied") {
      setNote("Link copiato.");
      setTimeout(() => setNote(""), 2500);
    }
  }

  const actions: Action[] = [];
  if (post.mine) {
    actions.push({
      label: "Elimina post",
      icon: <Trash2 size={19} />,
      danger: true,
      confirm: { question: "Eliminare il post?", detail: "Spariscono anche i commenti e le foto. Non si può annullare.", yes: "Elimina" },
      onSelect: async () => {
        try {
          await api.deletePost(post.id);
          onDeleted();
        } catch (e) {
          setNote(errMsg(e));
        }
      },
    });
  }
  actions.push({ label: "Condividi il link", icon: <Share2 size={19} />, onSelect: share });
  if (!post.mine) {
    actions.push({
      label: post.reported ? "Già segnalato" : "Segnala",
      icon: <Flag size={19} />,
      disabled: post.reported,
      onSelect: () => (me ? setReporting(true) : requireAuth("Entra per segnalare un contenuto")),
    });
  }
  if (me?.is_admin && !post.mine) {
    actions.push({
      label: "Elimina (admin)",
      icon: <Trash2 size={19} />,
      danger: true,
      confirm: { question: "Eliminare come amministratore?", detail: "Il post sparisce per tutti, con commenti e foto.", yes: "Elimina" },
      onSelect: async () => {
        try {
          await api.adminContent("post", post.id, "remove");
          onDeleted();
        } catch (e) {
          setNote(errMsg(e));
        }
      },
    });
  }

  return (
    <article className={full ? "pb-2" : "card px-5 pb-3 pt-4"}>
      <header className="flex items-start gap-3">
        <AuthorAvatar nickname={post.author} name={post.author_name} avatar={post.author_avatar} size={40} />
        <div className="min-w-0 flex-1 pt-0.5">
          <AuthorName nickname={post.author} name={post.author_name} />
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2.5 text-xs text-zinc-500">
            {proposal && (
              <span className="inline-flex items-center gap-1 font-semibold text-pulse">
                <Lightbulb size={12} /> Proposta
              </span>
            )}
            <span>{timeAgo(post.created_at)}</span>
            <span className="inline-flex items-center gap-0.5">
              <MapPin size={11} />
              {post.scope === "local" ? post.city : "Italia"}
            </span>
            {post.category && <span className="text-zinc-400">{post.category}</span>}
            {post.scope === "local" && post.audience === "local" && post.city && <LocalOnly city={post.city} />}
          </p>
        </div>
        <button onClick={() => setMenu(true)} aria-label="Altre azioni" className="-mr-1.5 rounded-full p-1.5 text-zinc-500 hover:bg-white/10 hover:text-white">
          <MoreHorizontal size={20} />
        </button>
      </header>

      {post.status === "hidden" && (
        <p className="mt-3 flex items-center gap-2 rounded-xl bg-maybe/10 px-3 py-2 text-xs text-maybe">
          <EyeOff size={14} /> Nascosto dopo alcune segnalazioni, in attesa di revisione. Lo vedi solo tu.
        </p>
      )}

      {proposal && post.headline && (
        <h3 className="mt-3 font-display text-[1.3rem] font-bold leading-[1.22] tracking-[-0.015em] text-zinc-50">{post.headline}</h3>
      )}

      {post.body && (
        <div className={proposal ? "mt-1.5" : "mt-3"}>
          <p className={`whitespace-pre-wrap break-words leading-[1.6] ${proposal ? "text-[15px] text-zinc-400" : "text-[15.5px] text-zinc-100"} ${!expanded && long ? "line-clamp-5" : ""}`}>{post.body}</p>
          {long && !expanded && (
            <button onClick={() => setExpanded(true)} className="mt-1 text-sm font-semibold text-zinc-400 hover:text-white">
              Mostra tutto
            </button>
          )}
        </div>
      )}

      <ImageGrid images={post.images} onOpen={setLightbox} />

      {proposal && (post.poll_id ? (
        <button
          onClick={() => openPoll(post.poll_id!)}
          className="mt-4 flex w-full items-center gap-3 rounded-2xl bg-pulse/[0.1] p-3.5 text-left ring-1 ring-pulse/25 transition hover:bg-pulse/[0.14]"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-pulse text-ink"><BarChart3 size={19} /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-zinc-50">È diventata un sondaggio</span>
            <span className="block text-xs text-zinc-400">{post.supports} persone l'hanno sostenuta: ora decidono tutti.</span>
          </span>
          <span className="inline-flex shrink-0 items-center gap-1 text-sm font-bold text-pulse">Vota ora <ArrowRight size={15} /></span>
        </button>
      ) : (
        <div className="mt-4" data-testid="proposal-progress">
          <div className="flex items-baseline justify-between text-[13px]">
            <span className="text-zinc-300">
              <strong className="font-display text-base text-zinc-50 tabular">{post.supports}</strong> su {goal} sostenitori
            </span>
            <span className="text-xs text-zinc-500">poi diventa un sondaggio</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/[0.07]">
            <div className="h-full rounded-full bg-pulse transition-[width] duration-500" style={{ width: `${Math.min(100, (post.supports / goal) * 100)}%` }} />
          </div>
        </div>
      ))}

      {(!full || !post.poll_id) && (
        <div className="-mx-2 mt-3 flex items-center gap-1 border-t border-line pt-2 text-[13.5px] font-medium text-zinc-400">
          {!post.poll_id && (
            <button
              onClick={toggleSupport}
              disabled={post.mine || supporting}
              aria-pressed={post.supported}
              title={post.mine ? (proposal ? "Sostenitori della tua proposta" : "Chi ha detto «Anch'io»") : undefined}
              data-testid="support"
              className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-2.5 py-1.5 transition ${
                post.supported ? "bg-pulse/[0.14] font-semibold text-pulse" : "enabled:hover:bg-white/5 enabled:hover:text-white"
              } disabled:cursor-default`}
            >
              {proposal ? <Lightbulb size={17} /> : <Hand size={17} />}
              {proposal ? (post.supported ? "La sostieni" : "Sostengo") : "Anch'io"}
              {post.supports > 0 && <span className="tabular text-zinc-500">{post.supports}</span>}
            </button>
          )}
          {!full && (
          <button onClick={onOpen} className="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-2.5 py-1.5 hover:bg-white/5 hover:text-white">
            <MessageCircle size={18} />
            {post.comment_count === 0 ? "Commenta" : `${post.comment_count} ${post.comment_count === 1 ? "commento" : "commenti"}`}
          </button>
          )}
          {!full && (
          <button onClick={share} aria-label="Condividi" className="flex items-center gap-2 rounded-full px-2.5 py-1.5 hover:bg-white/5 hover:text-white">
            <Share2 size={17} />
          </button>
          )}
          {!full && post.people > 0 && (
            <span className="ml-auto inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap pr-1 text-xs text-zinc-500" title="Persone diverse che hanno risposto">
              <Users size={14} /> {post.people}
              <span className="hidden sm:inline">{post.people === 1 ? "persona" : "persone"}</span>
            </span>
          )}
        </div>
      )}
      {note && <p className="mt-2 text-sm text-zinc-300">{note}</p>}

      {menu && <ActionSheet title="Post" actions={actions} onClose={() => setMenu(false)} />}
      {declaring && post.city && (
        <DeclareCity
          city={post.city}
          onClose={() => setDeclaring(false)}
          onDone={() => {
            setDeclaring(false);
            setNote(`Fatto: ora partecipi ai post e ai sondaggi di ${post.city}.`);
            setTimeout(() => setNote(""), 3000);
          }}
        />
      )}
      {lightbox !== null && <Lightbox images={post.images} start={lightbox} onClose={() => setLightbox(null)} />}
      {reporting && (
        <ReportDialog
          targetType="post"
          target={post.id}
          onClose={() => setReporting(false)}
          onDone={(hidden) => {
            setReporting(false);
            onChanged({ ...post, reported: true });
            setNote(hidden ? "Grazie: il post è stato nascosto in attesa di revisione." : "Grazie, segnalazione inviata.");
          }}
        />
      )}
    </article>
  );
}

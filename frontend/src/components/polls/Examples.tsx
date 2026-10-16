import type { ReactNode } from "react";
import { Clock, Hand, Lightbulb, MapPin, MessageCircle, UserRound, Users } from "lucide-react";
import type { Pct } from "../../types";
import Polso, { STANCES } from "./Polso";

/* Illustrazioni originali, solo forme semplici nei colori dell'app (nessuna immagine esterna). */
const Art = {
  parco: (
    <svg viewBox="0 0 320 200" className="h-full w-full" aria-hidden>
      <rect width="320" height="200" fill="#1a2a2a" />
      <circle cx="250" cy="52" r="26" fill="#ffd27a" opacity=".9" />
      <rect y="150" width="320" height="50" fill="#22382f" />
      {[60, 120, 190].map((x, i) => (
        <g key={x}>
          <rect x={x - 4} y={110 - i * 6} width="8" height={45 + i * 6} fill="#3a2f2a" />
          <circle cx={x} cy={100 - i * 8} r={30 + i * 4} fill={["#4fbf7a", "#3fa868", "#62cf8a"][i]} />
        </g>
      ))}
      <rect x="230" y="138" width="56" height="6" rx="3" fill="#c8ff3d" />
      <rect x="236" y="144" width="4" height="12" fill="#c8ff3d" />
      <rect x="276" y="144" width="4" height="12" fill="#c8ff3d" />
    </svg>
  ),
  bus: (
    <svg viewBox="0 0 320 200" className="h-full w-full" aria-hidden>
      <rect width="320" height="200" fill="#161d38" />
      {[30, 90, 150, 210, 270].map((x, i) => (
        <rect key={x} x={x} y={40 + (i % 2) * 18} width="34" height={110 - (i % 2) * 18} fill="#232c4d" />
      ))}
      {[38, 98, 158, 218, 278].map((x) => (
        <rect key={x} x={x} y="70" width="8" height="8" fill="#ffd27a" opacity=".8" />
      ))}
      <rect y="150" width="320" height="50" fill="#1f2740" />
      <rect x="70" y="110" width="180" height="58" rx="14" fill="#9aa8ff" />
      {[86, 126, 166, 206].map((x) => (
        <rect key={x} x={x} y="120" width="30" height="20" rx="4" fill="#0e1322" />
      ))}
      <circle cx="105" cy="170" r="11" fill="#0b0f1c" />
      <circle cx="215" cy="170" r="11" fill="#0b0f1c" />
      <circle cx="244" cy="152" r="5" fill="#ffd27a" />
    </svg>
  ),
  libri: (
    <svg viewBox="0 0 320 200" className="h-full w-full" aria-hidden>
      <rect width="320" height="200" fill="#2a1f33" />
      <rect y="160" width="320" height="40" fill="#3a2b45" />
      {[
        [70, 70, "#ff6e7f"],
        [100, 55, "#c8ff3d"],
        [128, 80, "#9aa8ff"],
        [160, 62, "#ffd27a"],
        [190, 74, "#7fe0d0"],
        [220, 50, "#ff9aa6"],
      ].map(([x, y, c]) => (
        <rect key={String(x)} x={Number(x)} y={Number(y)} width="26" height={160 - Number(y)} rx="3" fill={String(c)} />
      ))}
      <circle cx="270" cy="40" r="14" fill="#ffd27a" opacity=".7" />
    </svg>
  ),
  mare: (
    <svg viewBox="0 0 320 200" className="h-full w-full" aria-hidden>
      <rect width="320" height="200" fill="#16263a" />
      <circle cx="160" cy="110" r="44" fill="#ff9a6e" />
      <rect y="110" width="320" height="90" fill="#1d3a5a" />
      {[125, 145, 165].map((y, i) => (
        <path key={y} d={`M0 ${y} q40 -10 80 0 t80 0 t80 0 t80 0`} stroke="#9aa8ff" strokeWidth="3" fill="none" opacity={0.8 - i * 0.2} />
      ))}
      <rect y="178" width="320" height="22" fill="#d9c08a" />
    </svg>
  ),
};

export interface Example {
  title: string;
  description: string;
  category: string;
  place: string;
  left: string;
  art: ReactNode;
  pct: Pct;
  total: number;
}

export const EXAMPLES: Example[] = [
  { title: "Più panchine all'ombra nel parco del quartiere?", description: "D'estate le panchine al sole restano vuote.", category: "Città", place: "La tua città", left: "Ancora 3 giorni", art: Art.parco, pct: { yes: 72, depends: 18, no: 10 }, total: 214 },
  { title: "Bus notturni anche nel weekend?", description: "Più sicurezza e meno auto, ma servono fondi.", category: "Trasporti", place: "Tutta Italia", left: "Ancora 1 settimana", art: Art.bus, pct: { yes: 58, depends: 25, no: 17 }, total: 1380 },
  { title: "Biblioteche aperte anche la domenica?", description: "Per chi studia o lavora tutta la settimana.", category: "Scuola", place: "Tutta Italia", left: "Ancora 5 ore", art: Art.libri, pct: { yes: 64, depends: 21, no: 15 }, total: 892 },
  { title: "Lungomare pedonale tutto l'anno?", description: "Oggi lo è solo d'estate.", category: "Ambiente", place: "La tua città", left: "Concluso", art: Art.mare, pct: { yes: 41, depends: 14, no: 45 }, total: 530 },
];

/** Come appare un sondaggio: usata per gli esempi e per l'anteprima mentre lo crei. */
export function PollFace({
  title,
  description,
  category,
  place,
  left,
  image,
  pct,
  total,
  badge,
  compact = false,
}: {
  title: string;
  description?: string;
  category?: string;
  place: string;
  left?: string | null;
  image?: ReactNode;
  pct: Pct | null;
  total: number;
  badge: string;
  compact?: boolean;
}) {
  return (
    <article className={`card flex h-full flex-col ${compact ? "p-4" : "p-5"}`}>
      <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold">
        <span className="rounded-full bg-pulse px-2.5 py-1 text-ink">{badge}</span>
        {category && !compact && <span className="rounded-full bg-white/[0.07] px-2.5 py-1 text-zinc-300">{category}</span>}
        <span className="inline-flex items-center gap-1 rounded-full bg-white/[0.07] px-2.5 py-1 text-zinc-300">
          <MapPin size={12} /> {place}
        </span>
        {left && (
          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 ${left === "Concluso" ? "bg-white/[0.07] text-zinc-400" : "bg-maybe/15 text-maybe"}`}>
            <Clock size={12} /> {left}
          </span>
        )}
      </div>
      <h3 className={`mt-3 font-display font-bold leading-[1.2] tracking-tight text-zinc-50 ${compact ? "text-[1.08rem]" : "text-[1.3rem]"}`}>
        {title || <span className="text-zinc-600">La tua domanda apparirà qui</span>}
      </h3>
      {description && !compact && <p className="mt-1.5 line-clamp-2 text-sm leading-6 text-zinc-400">{description}</p>}
      {image && <div className={`mt-3 overflow-hidden rounded-2xl ${compact ? "aspect-[16/10]" : "aspect-[16/9]"}`}>{image}</div>}
      <div className="mt-auto pt-4">
        {pct ? (
          <Polso pct={pct} size="sm" animate={false} />
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2">
              {STANCES.map((s) => (
                <span key={s.v} className="flex flex-col items-center gap-1.5 rounded-2xl bg-white/[0.05] py-2.5 text-xs font-bold">
                  <span className={`h-2 w-2 rounded-full ${s.bg}`} />
                  {s.label}
                </span>
              ))}
            </div>
            <div className="mt-3">
              <Polso pct={null} size="sm" />
            </div>
          </>
        )}
        <p className="mt-3 flex items-center gap-1.5 text-xs text-zinc-500">
          <Users size={13} /> {total === 0 ? "Ancora nessun voto" : `${total.toLocaleString("it-IT")} voti`}
        </p>
      </div>
    </article>
  );
}

/* ---------- Esempi di post: stessi colori e stesse forme semplici ---------- */

const PostArt = {
  mercato: (
    <svg viewBox="0 0 320 200" className="h-full w-full" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <rect width="320" height="200" fill="#1b2236" />
      <rect y="150" width="320" height="50" fill="#232b45" />
      {[8, 112, 216].map((x, i) => (
        <g key={x}>
          <rect x={x + 4} y="40" width="5" height="112" fill="#3a4260" />
          <rect x={x + 87} y="40" width="5" height="112" fill="#3a4260" />
          <rect x={x} y="88" width="96" height="64" rx="5" fill="#2c3554" />
          {[0, 1, 2, 3, 4, 5].map((k) => (
            <rect key={k} x={x + k * 16} y="44" width="16" height="40" fill={k % 2 ? "#f6f7fb" : ["#ff6e7f", "#c8ff3d", "#9aa8ff"][i]} />
          ))}
          <circle cx={x + 24} cy="120" r="12" fill="#ffd27a" />
          <circle cx={x + 50} cy="122" r="11" fill="#ff9aa6" />
          <circle cx={x + 74} cy="119" r="12" fill="#7fe0d0" />
        </g>
      ))}
    </svg>
  ),
  bici: (
    <svg viewBox="0 0 320 200" className="h-full w-full" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <rect width="320" height="200" fill="#1b2236" />
      <rect y="120" width="320" height="80" fill="#2a3150" />
      <rect y="148" width="320" height="26" fill="#3f8f5a" />
      {[10, 70, 130, 190, 250, 310].map((x) => (
        <rect key={x} x={x} y="159" width="30" height="4" rx="2" fill="#f6f7fb" opacity="0.8" />
      ))}
      <g stroke="#c8ff3d" strokeWidth="6" fill="none" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="120" cy="112" r="24" />
        <circle cx="200" cy="112" r="24" />
        <path d="M120 112 L148 76 L184 76 L200 112 M148 76 L160 112 L184 76 M140 66 h18 M184 76 l-6 -14 h14" />
      </g>
      {[40, 270].map((x) => (
        <g key={x}>
          <rect x={x - 3} y="62" width="6" height="58" fill="#3a4260" />
          <circle cx={x} cy="56" r="22" fill="#5fcf8a" />
        </g>
      ))}
    </svg>
  ),
  tramonto: (
    <svg viewBox="0 0 320 200" className="h-full w-full" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <rect width="320" height="200" fill="#2a2347" />
      <rect y="70" width="320" height="60" fill="#5a3a63" />
      <circle cx="210" cy="118" r="34" fill="#ffb27a" />
      <rect y="118" width="320" height="82" fill="#1b2236" />
      {[132, 146, 160].map((y, i) => (
        <rect key={y} x={150 + i * 12} y={y} width={120 - i * 24} height="4" rx="2" fill="#ffb27a" opacity={0.6 - i * 0.15} />
      ))}
      <path d="M0 118 V84 h22 v-18 h18 v30 h20 v-40 h26 v52 h16 v-24 h20 v34 Z" fill="#11162a" />
    </svg>
  ),
  murale: (
    <svg viewBox="0 0 320 200" className="h-full w-full" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <rect width="320" height="200" fill="#1b2236" />
      <rect x="20" y="28" width="280" height="132" rx="6" fill="#2c3554" />
      <circle cx="92" cy="94" r="44" fill="#ff6e7f" />
      <rect x="128" y="50" width="70" height="88" rx="35" fill="#c8ff3d" />
      <path d="M206 140 L246 56 L286 140 Z" fill="#9aa8ff" />
      <circle cx="232" cy="66" r="12" fill="#ffd27a" />
      <rect x="48" y="122" width="62" height="10" rx="5" fill="#7fe0d0" />
      <rect y="160" width="320" height="40" fill="#232b45" />
      <rect x="40" y="166" width="10" height="26" rx="3" fill="#3a4260" />
      <rect x="270" y="166" width="10" height="26" rx="3" fill="#3a4260" />
    </svg>
  ),
};

export interface PostExample {
  place: string;
  body: string;
  art: ReactNode;
  comments: number;
  /** "Anch'io" sui post, sostenitori sulle proposte */
  supports: number;
  /** solo le proposte: la frase e il traguardo */
  headline?: string;
  goal?: number;
}

export const POST_EXAMPLES: PostExample[] = [
  { place: "La tua città", body: "Domenica mercatino dell'usato in piazza, dalle 10. Chi porta cosa? Servono tavoli e qualcuno per la musica.", art: PostArt.mercato, comments: 14, supports: 26 },
  { place: "La tua città", body: "Hanno aperto la nuova pista ciclabile lungo il fiume. L'avete già provata? Com'è?", art: PostArt.bici, comments: 23, supports: 41 },
  { place: "La tua città", headline: "Lampioni nuovi al belvedere", body: "La sera è completamente al buio e non ci va più nessuno.", art: PostArt.tramonto, comments: 8, supports: 14, goal: 20 },
  { place: "La tua città", body: "Hanno finito il murale sul muro della scuola di quartiere. A voi piace?", art: PostArt.murale, comments: 31, supports: 58 },
];

/** Come appare un post (per gli esempi): stessa card dei post veri. */
export function PostFace({ place, body, art, comments, supports, headline, goal }: PostExample) {
  const proposal = Boolean(headline);
  return (
    <article className="card flex h-full flex-col p-4">
      <header className="flex items-center gap-2.5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-maybe/15 text-maybe"><UserRound size={16} /></span>
        <span className="min-w-0 flex-1 leading-tight">
          <span className="block truncate text-sm font-bold text-zinc-100">{proposal ? "La tua proposta" : "Il tuo post"}</span>
          <span className="inline-flex items-center gap-1 text-xs text-zinc-500">
            {proposal ? <><Lightbulb size={11} className="text-pulse" /> <span className="font-semibold text-pulse">Proposta</span> ·</> : <MapPin size={11} />} {place}
          </span>
        </span>
        <span className="rounded-full bg-pulse px-2.5 py-1 text-xs font-semibold text-ink">Esempio</span>
      </header>
      {proposal && <h3 className="mt-3 font-display text-[1.08rem] font-bold leading-tight text-zinc-50">{headline}</h3>}
      <p className={`line-clamp-3 leading-[1.5] ${proposal ? "mt-1 text-[13.5px] text-zinc-400" : "mt-3 text-[14.5px] text-zinc-100"}`}>{body}</p>
      <div className="mt-3 aspect-[16/10] overflow-hidden rounded-2xl">{art}</div>
      {proposal && goal ? (
        <div className="mt-3">
          <p className="text-xs text-zinc-400"><strong className="text-zinc-50">{supports}</strong> su {goal} sostenitori · poi diventa un sondaggio</p>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/[0.07]">
            <div className="h-full rounded-full bg-pulse" style={{ width: `${(supports / goal) * 100}%` }} />
          </div>
        </div>
      ) : null}
      <p className="mt-auto flex items-center gap-4 pt-3 text-xs text-zinc-500">
        <span className="inline-flex items-center gap-1.5">
          {proposal ? <Lightbulb size={13} /> : <Hand size={13} />} {proposal ? "Sostengo" : `Anch'io ${supports}`}
        </span>
        <span className="inline-flex items-center gap-1.5"><MessageCircle size={13} /> {comments} commenti</span>
      </p>
    </article>
  );
}

type IdeaKind = "mixed" | "posts" | "polls";

function ideaCards(kind: IdeaKind): { key: string; node: ReactNode }[] {
  const posts = POST_EXAMPLES.map((p, i) => ({ key: `p-${i}`, node: <PostFace {...p} /> }));
  const polls = EXAMPLES.map((e) => ({ key: `q-${e.title}`, node: <PollFace {...e} image={e.art} badge="Esempio" compact /> }));
  if (kind === "posts") return posts;
  if (kind === "polls") return polls;
  // nella home: un post, un sondaggio, una proposta, un sondaggio (le tre cose che si possono fare)
  return [posts[0], polls[0], posts[2], polls[1]];
}

/**
 * Idee per iniziare: 4 esempi di post e 4 di sondaggi (numeri inventati, segnati con «Esempio»).
 * Telefono: striscia da scorrere · finestre più larghe: griglia a due colonne (niente tagli ai bordi).
 */
export function Ideas({ title, text, action, kind }: { title: string; text?: string; action?: ReactNode; kind: IdeaKind }) {
  const cards = ideaCards(kind);
  return (
    <section className="py-1" aria-label={title} data-testid="examples">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display text-[1.15rem] font-bold leading-tight text-zinc-50">{title}</h2>
          {text && <p className="mt-0.5 text-[13px] leading-5 text-zinc-500">{text}</p>}
        </div>
        {action}
      </div>
      <div className="-mx-4 mt-3 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-1 no-scrollbar sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0">
        {cards.map((c) => (
          <div key={c.key} className="w-[78%] max-w-[300px] shrink-0 snap-start sm:w-auto sm:max-w-none">
            {c.node}
          </div>
        ))}
      </div>
    </section>
  );
}

/** Retrocompatibilità: la vecchia striscia di soli sondaggi. */
export function ExamplesCarousel({ title, text, action }: { title: string; text?: string; action?: ReactNode }) {
  return <Ideas title={title} text={text} action={action} kind="polls" />;
}

import type { ReactNode } from "react";
import { Clock, Hand, Lightbulb, MapPin, MessageCircle, UserRound, Users } from "lucide-react";
import type { Pct } from "../../types";
import Polso, { STANCES } from "./Polso";

/* Illustrazioni originali, solo forme semplici nei colori dell'app (nessuna immagine esterna). */
const Art = {
  // settimana corta: un calendario con il venerdì libero
  calendario: (
    <svg viewBox="0 0 320 200" className="h-full w-full" aria-hidden>
      <rect width="320" height="200" fill="#1b2236" />
      <rect x="60" y="34" width="200" height="140" rx="14" fill="#2c3554" />
      <rect x="60" y="34" width="200" height="34" rx="14" fill="#9aa8ff" />
      <rect x="60" y="54" width="200" height="14" fill="#9aa8ff" />
      {[96, 224].map((x) => (
        <rect key={x} x={x - 4} y="24" width="8" height="22" rx="4" fill="#f6f7fb" />
      ))}
      {[0, 1, 2, 3, 4].map((i) => (
        <rect key={i} x={76 + i * 36} y="84" width="28" height="28" rx="6" fill={i === 4 ? "#c8ff3d" : "#3a4260"} />
      ))}
      {[0, 1, 2, 3, 4].map((i) => (
        <rect key={i} x={76 + i * 36} y="124" width="28" height="28" rx="6" fill={i === 4 ? "#c8ff3d" : "#3a4260"} />
      ))}
      <path d="M226 98 l6 6 l10 -12 M226 138 l6 6 l10 -12" stroke="#0e1322" strokeWidth="4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  // contenuti creati con l'intelligenza artificiale: un telefono con l'etichetta "IA"
  telefono: (
    <svg viewBox="0 0 320 200" className="h-full w-full" aria-hidden>
      <rect width="320" height="200" fill="#211c38" />
      <circle cx="70" cy="60" r="34" fill="#9aa8ff" opacity=".18" />
      <circle cx="260" cy="150" r="44" fill="#c8ff3d" opacity=".1" />
      <rect x="118" y="22" width="84" height="164" rx="16" fill="#0e1322" />
      <rect x="125" y="34" width="70" height="132" rx="8" fill="#2c3554" />
      <rect x="132" y="44" width="56" height="44" rx="6" fill="#ff9aa6" />
      <circle cx="150" cy="60" r="7" fill="#ffd27a" />
      <path d="M134 86 l18 -16 l14 10 l20 -14 v22 Z" fill="#7fe0d0" />
      <rect x="132" y="96" width="56" height="6" rx="3" fill="#3a4260" />
      <rect x="132" y="108" width="40" height="6" rx="3" fill="#3a4260" />
      <rect x="168" y="38" width="30" height="18" rx="9" fill="#c8ff3d" />
      <text x="183" y="51" textAnchor="middle" fontSize="11" fontWeight="800" fill="#0e1322" fontFamily="sans-serif">IA</text>
    </svg>
  ),
  // sanità: liste d'attesa (una croce e un orologio)
  sanita: (
    <svg viewBox="0 0 320 200" className="h-full w-full" aria-hidden>
      <rect width="320" height="200" fill="#16263a" />
      <rect y="160" width="320" height="40" fill="#1d3a5a" />
      <rect x="54" y="60" width="130" height="100" rx="6" fill="#2c3554" />
      <rect x="98" y="30" width="42" height="42" rx="8" fill="#f6f7fb" />
      <rect x="114" y="38" width="10" height="26" rx="2" fill="#ff6e7f" />
      <rect x="106" y="46" width="26" height="10" rx="2" fill="#ff6e7f" />
      {[0, 1, 2].map((i) => (
        <rect key={i} x={70 + i * 36} y="90" width="24" height="20" rx="3" fill="#7fe0d0" opacity=".7" />
      ))}
      <rect x="104" y="124" width="30" height="36" rx="3" fill="#3a4260" />
      <circle cx="238" cy="96" r="44" fill="#ffd27a" />
      <circle cx="238" cy="96" r="36" fill="#16263a" />
      <path d="M238 72 V96 L256 106" stroke="#ffd27a" strokeWidth="6" fill="none" strokeLinecap="round" />
    </svg>
  ),
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
  { title: "Settimana lavorativa di 4 giorni, a parità di stipendio?", description: "Più tempo e benessere, o costi che le aziende non reggono?", category: "Lavoro", place: "Tutta Italia", left: "Ancora 3 giorni", art: Art.calendario, pct: { yes: 61, depends: 24, no: 15 }, total: 2140 },
  { title: "Etichetta obbligatoria su foto e video creati con l'IA?", description: "Per non confondere notizie vere e contenuti generati.", category: "Tecnologia", place: "Tutta Italia", left: "Ancora 1 settimana", art: Art.telefono, pct: { yes: 78, depends: 12, no: 10 }, total: 1520 },
  { title: "Visite specialistiche entro 30 giorni o rimborso del privato?", description: "Mesi di attesa per un esame: chi paga se il pubblico non ce la fa?", category: "Sanità", place: "Tutta Italia", left: "Ancora 5 ore", art: Art.sanita, pct: { yes: 66, depends: 19, no: 15 }, total: 3080 },
  { title: "Più verde e meno parcheggi nel centro della tua città?", description: "Alberi e piazze vivibili, o più difficile arrivare in centro?", category: "Città", place: "La tua città", left: "Concluso", art: Art.parco, pct: { yes: 44, depends: 22, no: 34 }, total: 486 },
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
  // stipendi: una busta paga e poche monete
  stipendio: (
    <svg viewBox="0 0 320 200" className="h-full w-full" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <rect width="320" height="200" fill="#1b2236" />
      <rect x="54" y="38" width="130" height="132" rx="10" fill="#f6f7fb" />
      <rect x="70" y="56" width="70" height="10" rx="5" fill="#3a4260" />
      {[80, 98, 116].map((y, i) => (
        <g key={y}>
          <rect x="70" y={y} width={60 - i * 10} height="7" rx="3.5" fill="#949db6" />
          <rect x="146" y={y} width="24" height="7" rx="3.5" fill="#949db6" />
        </g>
      ))}
      <rect x="70" y="140" width="100" height="16" rx="5" fill="#ff6e7f" />
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <ellipse cx="240" cy={152 - i * 14} rx="38" ry="11" fill="#c9a640" />
          <ellipse cx="240" cy={148 - i * 14} rx="38" ry="11" fill="#ffd27a" />
        </g>
      ))}
      <path d="M268 44 v52 m-14 -14 l14 14 l14 -14" stroke="#ff6e7f" strokeWidth="7" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  // benzina: la pompa e il prezzo che sale
  benzina: (
    <svg viewBox="0 0 320 200" className="h-full w-full" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <rect width="320" height="200" fill="#2a1f33" />
      <rect y="166" width="320" height="34" fill="#3a2b45" />
      <rect x="70" y="40" width="84" height="128" rx="10" fill="#ff6e7f" />
      <rect x="82" y="54" width="60" height="38" rx="6" fill="#0e1322" />
      <text x="112" y="80" textAnchor="middle" fontSize="18" fontWeight="800" fill="#ffd27a" fontFamily="sans-serif">2,0</text>
      <rect x="82" y="104" width="60" height="10" rx="5" fill="#f6f7fb" opacity=".8" />
      <path d="M154 70 h22 a10 10 0 0 1 10 10 v54 a10 10 0 0 0 20 0 v-42 l-14 -14" stroke="#f6f7fb" strokeWidth="6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M222 126 l22 -26 l18 14 l26 -40" stroke="#c8ff3d" strokeWidth="7" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M272 70 h18 v18" stroke="#c8ff3d" strokeWidth="7" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  // scuola: un banco con un cuore (supporto psicologico)
  scuola: (
    <svg viewBox="0 0 320 200" className="h-full w-full" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <rect width="320" height="200" fill="#16263a" />
      <rect x="40" y="26" width="240" height="96" rx="8" fill="#1f4a3a" />
      <rect x="40" y="26" width="240" height="96" rx="8" fill="none" stroke="#c9a640" strokeWidth="6" />
      <path d="M160 96 C120 70 128 42 148 46 C156 48 160 56 160 56 C160 56 164 48 172 46 C192 42 200 70 160 96 Z" fill="#ff6e7f" />
      <rect x="70" y="140" width="180" height="12" rx="4" fill="#c9a640" />
      <rect x="86" y="152" width="8" height="36" fill="#3a4260" />
      <rect x="226" y="152" width="8" height="36" fill="#3a4260" />
      <rect x="120" y="126" width="34" height="14" rx="3" fill="#9aa8ff" />
      <rect x="160" y="130" width="40" height="10" rx="3" fill="#ffd27a" />
    </svg>
  ),
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
  { place: "Tutta Italia", body: "Laurea, cinque anni di esperienza e 1.400 € al mese. L'affitto se ne porta via più della metà. Succede solo a me o è normale?", art: PostArt.stipendio, comments: 127, supports: 312 },
  { place: "Tutta Italia", body: "Benzina di nuovo sopra i 2 € al litro. Per chi va al lavoro in macchina sono quasi 150 € al mese. Voi come vi organizzate?", art: PostArt.benzina, comments: 64, supports: 189 },
  { place: "Tutta Italia", headline: "Uno psicologo gratuito in ogni scuola superiore", body: "Ansia, pressione, solitudine: tanti ragazzi non sanno a chi chiedere aiuto.", art: PostArt.scuola, comments: 41, supports: 14, goal: 20 },
  { place: "La tua città", body: "Domenica mercatino dell'usato in piazza, dalle 10. Chi porta cosa? Servono tavoli e qualcuno per la musica.", art: PostArt.mercato, comments: 14, supports: 26 },
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

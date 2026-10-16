import { useEffect, useRef, useState, type FormEvent } from "react";
import { ImagePlus, Lightbulb, MessageSquareText, X } from "lucide-react";
import { api, errMsg } from "../../api";
import type { Me, Post } from "../../types";
import { ACCEPTED, prepareImage } from "../../imageResize";
import WherePicker from "../map/WherePicker";
import { Chip, Field, PublishNote, TopicPicker } from "../compose/Parts";
import Avatar from "./Avatar";
import Sheet from "./Sheet";

const MAX_IMAGES = 4;
const MAX_CHARS = 2000;
const HEAD_MIN = 10;
const HEAD_MAX = 140;

interface Picked {
  file: File;
  url: string;
}

/**
 * Nuovo post, a tutto schermo. Due possibilità, una sola scelta in alto:
 * - Post: racconta cosa succede (testo e/o foto); gli altri rispondono con "Anch'io";
 * - Proposta: cosa vorresti cambiare, in una frase; con abbastanza sostenitori diventa un sondaggio.
 */
export default function Composer({
  me,
  categories,
  goal = 20,
  onCancel,
  onPublished,
}: {
  me: Me;
  categories: string[];
  goal?: number;
  onCancel: () => void;
  onPublished: (p: Post) => void;
}) {
  const [kind, setKind] = useState<"post" | "proposal">("post");
  const [headline, setHeadline] = useState("");
  const [text, setText] = useState("");
  const [picked, setPicked] = useState<Picked[]>([]);
  const [scope, setScope] = useState<"national" | "local">("national");
  const [audience, setAudience] = useState<"all" | "local">("all");
  const [city, setCity] = useState(me.city ?? "");
  const [category, setCategory] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const urls = useRef<string[]>([]);

  // libera la memoria delle anteprime quando il componente si chiude
  useEffect(() => () => urls.current.forEach(URL.revokeObjectURL), []);

  function addFiles(list: FileList | null) {
    if (!list) return;
    const room = MAX_IMAGES - picked.length;
    const files = Array.from(list).slice(0, room);
    if (list.length > room) setError(`Puoi aggiungere al massimo ${MAX_IMAGES} foto.`);
    const next = files.map((file) => {
      const url = URL.createObjectURL(file);
      urls.current.push(url);
      return { file, url };
    });
    setPicked((p) => [...p, ...next]);
  }

  const head = headline.replace(/\s+/g, " ").trim();
  const ready = kind === "proposal" ? head.length >= HEAD_MIN : text.trim().length > 0 || picked.length > 0;
  const where = scope === "local" && city ? city : "tutta Italia";

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.append("body", text);
      form.append("kind", kind);
      if (kind === "proposal") form.append("headline", head);
      form.append("scope", scope);
      if (scope === "local") {
        form.append("city", city);
        form.append("audience", audience);
      }
      form.append("category", category);
      for (const p of picked) form.append("files", await prepareImage(p.file));
      onPublished(await api.createPost(form));
    } catch (err) {
      setError(errMsg(err));
      setBusy(false);
    }
  }

  return (
    <Sheet
      title={kind === "proposal" ? "Nuova proposta" : "Nuovo post"}
      onClose={onCancel}
      tall
      footer={
        <>
          {error && <p role="alert" className="mb-3 rounded-xl bg-no/10 px-3 py-2 text-sm text-no">{error}</p>}
          <button
            onClick={() => submit()}
            disabled={busy || !ready}
            className="w-full rounded-2xl bg-pulse py-3.5 font-display text-[15.5px] font-bold text-ink transition hover:brightness-110 disabled:bg-white/[0.07] disabled:text-zinc-500"
          >
            {busy ? (picked.length ? "Carico le foto…" : "Pubblico…") : kind === "proposal" ? "Pubblica la proposta" : "Pubblica"}
          </button>
          {kind === "proposal" && !ready && !busy && (
            <p className="mt-2 text-center text-xs text-zinc-500">Scrivi la proposta in una frase (almeno {HEAD_MIN} caratteri)</p>
          )}
        </>
      }
    >
      <form onSubmit={submit} className="space-y-6 pb-2">
        {/* una sola scelta: racconti qualcosa o proponi un cambiamento */}
        <div className="grid grid-cols-2 gap-1 rounded-2xl border border-line bg-raised p-1" role="radiogroup" aria-label="Tipo">
          {([
            ["post", "Post", <MessageSquareText key="i" size={16} />],
            ["proposal", "Proposta", <Lightbulb key="i" size={16} />],
          ] as const).map(([id, label, icon]) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={kind === id}
              onClick={() => setKind(id)}
              className={`flex items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-semibold transition ${kind === id ? "bg-zinc-50 text-ink" : "text-zinc-400 hover:text-white"}`}
            >
              {icon} {label}
            </button>
          ))}
        </div>

        {kind === "proposal" ? (
          <div className="-mt-2 space-y-3">
            <div className="flex gap-3 rounded-2xl bg-pulse/[0.08] p-3.5 text-[13px] leading-5 text-zinc-300">
              <Lightbulb size={18} className="mt-0.5 shrink-0 text-pulse" />
              <span>
                Cosa vorresti cambiare? Quando <strong className="text-zinc-50">{goal} persone</strong> la sostengono, la proposta
                diventa un <strong className="text-zinc-50">sondaggio</strong> per {where} e tutti possono votarla.
              </span>
            </div>
            <div>
              <textarea
                autoFocus
                value={headline}
                onChange={(e) => setHeadline(e.target.value.replace(/\n/g, " "))}
                maxLength={HEAD_MAX}
                rows={2}
                aria-label="La tua proposta"
                placeholder="Es. Una fontanella d'acqua in piazza Garibaldi"
                className="w-full resize-none bg-transparent font-display text-[1.35rem] font-bold leading-snug tracking-[-0.01em] outline-none placeholder:text-zinc-600"
              />
              <p className="tabular text-right text-xs text-zinc-600">{head.length}/{HEAD_MAX}</p>
            </div>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={MAX_CHARS}
              rows={3}
              aria-label="Perché è utile"
              placeholder="Perché è utile? (facoltativo)"
              className="w-full resize-none rounded-2xl border border-line bg-raised px-4 py-3 text-[15px] leading-6 outline-none placeholder:text-zinc-500 focus:border-pulse/60"
            />
          </div>
        ) : (
          <div className="-mt-1 flex gap-3">
            <Avatar name={me.name ?? me.nickname} src={me.avatar} size={40} />
            <div className="min-w-0 flex-1">
              <textarea
                autoFocus
                value={text}
                onChange={(e) => setText(e.target.value)}
                maxLength={MAX_CHARS}
                rows={5}
                aria-label="Testo del post"
                placeholder="Cosa succede nella tua città?"
                className="w-full resize-none bg-transparent pt-2 text-[17px] leading-7 outline-none placeholder:text-zinc-600"
              />
              {text.length > MAX_CHARS - 200 && <p className="tabular text-right text-xs text-zinc-500">{text.length}/{MAX_CHARS}</p>}
            </div>
          </div>
        )}

        {picked.length > 0 && (
          <div className="-mt-2 grid grid-cols-4 gap-2">
            {picked.map((p, i) => (
              <div key={p.url} className="relative aspect-square overflow-hidden rounded-xl bg-zinc-900">
                <img src={p.url} alt={`Foto ${i + 1}`} className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => setPicked((all) => all.filter((x) => x !== p))}
                  aria-label={`Rimuovi foto ${i + 1}`}
                  className="absolute right-1 top-1 rounded-full bg-black/70 p-1 text-white hover:bg-black"
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="-mt-2">
          <input
            ref={input}
            type="file"
            accept={ACCEPTED}
            multiple
            hidden
            aria-label="Foto del post"
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
          />
          {picked.length < MAX_IMAGES && (
            <Chip on={false} onClick={() => input.current?.click()}>
              <ImagePlus size={15} /> {picked.length ? `Altre foto (${picked.length}/${MAX_IMAGES})` : "Foto"}
            </Chip>
          )}
        </div>

        <Field label="Dove">
          <WherePicker kind="post" scope={scope} city={city} onChange={(sc, c) => { setScope(sc); setCity(c); }} audience={audience} onAudience={setAudience} />
        </Field>

        <Field label="Argomento" hint="(facoltativo)">
          <TopicPicker suggestions={categories} value={category} onChange={setCategory} />
        </Field>

        <PublishNote />
      </form>
    </Sheet>
  );
}

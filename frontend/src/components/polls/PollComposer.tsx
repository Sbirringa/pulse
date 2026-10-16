import { useEffect, useRef, useState, type FormEvent } from "react";
import { AlignLeft, ImagePlus, X } from "lucide-react";
import { api, errMsg } from "../../api";
import type { Me, Poll } from "../../types";
import { ACCEPTED, prepareImage } from "../../imageResize";
import Sheet from "../social/Sheet";
import WherePicker from "../map/WherePicker";
import { Chip, ChipRow, Field, PublishNote, TopicPicker } from "../compose/Parts";

const DURATIONS: { days: number | null; label: string }[] = [
  { days: 1, label: "1 giorno" },
  { days: 3, label: "3 giorni" },
  { days: 7, label: "1 settimana" },
  { days: 30, label: "1 mese" },
  { days: null, label: "Senza scadenza" },
];

/** Crea un sondaggio: la domanda, e se vuoi descrizione, foto, durata, città e argomento. Si pubblica subito. */
export default function PollComposer({
  me,
  categories,
  onClose,
  onPublished,
}: {
  me: Me;
  categories: string[];
  onClose: () => void;
  onPublished: (p: Poll) => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [showDescription, setShowDescription] = useState(false);
  const [category, setCategory] = useState("");
  const [scope, setScope] = useState<"national" | "local">("national");
  const [audience, setAudience] = useState<"all" | "local">("all");
  const [city, setCity] = useState(me.city ?? "");
  const [days, setDays] = useState<number | null>(7);
  const [photo, setPhoto] = useState<{ file: File; url: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => () => (photo ? URL.revokeObjectURL(photo.url) : undefined), [photo]);

  const ready = title.trim().length >= 10 && category !== "";

  async function submit(e?: FormEvent) {
    e?.preventDefault();
    if (!category) {
      setError("Scegli un argomento.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.append("title", title.trim());
      form.append("description", description.trim());
      form.append("category", category);
      form.append("scope", scope);
      if (scope === "local") {
        form.append("city", city);
        form.append("audience", audience);
      }
      if (days) form.append("duration_days", String(days));
      if (photo) form.append("image", await prepareImage(photo.file));
      onPublished(await api.createPoll(form));
    } catch (err) {
      setError(errMsg(err));
      setBusy(false);
    }
  }

  return (
    <Sheet
      title="Nuovo sondaggio"
      onClose={onClose}
      tall
      footer={
        <>
          {error && <p role="alert" className="mb-3 rounded-xl bg-no/10 px-3 py-2 text-sm text-no">{error}</p>}
          <button
            onClick={() => submit()}
            disabled={busy || !ready}
            className="w-full rounded-2xl bg-pulse py-3.5 font-display text-[15.5px] font-bold text-ink transition hover:brightness-110 disabled:bg-white/[0.07] disabled:text-zinc-500"
          >
            {busy ? "Pubblico…" : "Pubblica il sondaggio"}
          </button>
          {!ready && !busy && (
            <p className="mt-2 text-center text-xs text-zinc-500">
              {title.trim().length < 10 ? "Scrivi la domanda (almeno 10 caratteri)" : "Scegli un argomento"}
            </p>
          )}
        </>
      }
    >
      <form onSubmit={submit} className="space-y-6 pb-2">
        <div>
          <textarea
            autoFocus
            required
            minLength={10}
            maxLength={160}
            rows={3}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            aria-label="La tua domanda"
            placeholder="Fai una domanda a tutti…"
            className="w-full resize-none bg-transparent font-display text-[1.65rem] font-bold leading-tight tracking-tight outline-none placeholder:text-zinc-600"
          />
          <p className="tabular text-right text-xs text-zinc-600">{title.length}/160</p>
        </div>

        {showDescription && (
          <textarea
            autoFocus
            maxLength={600}
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            aria-label="Descrizione"
            placeholder="Spiega in due righe perché è importante"
            className="-mt-3 w-full resize-none rounded-2xl bg-white/[0.05] px-4 py-3 text-[15px] leading-6 outline-none ring-1 ring-white/10 placeholder:text-zinc-600 focus:ring-pulse/60"
          />
        )}

        {photo && (
          <div className="relative -mt-3 overflow-hidden rounded-2xl">
            <img src={photo.url} alt="Foto del sondaggio" className="aspect-[16/9] w-full object-cover" />
            <button type="button" onClick={() => setPhoto(null)} aria-label="Togli la foto" className="absolute right-2 top-2 rounded-full bg-black/70 p-1.5 text-white hover:bg-black">
              <X size={18} />
            </button>
          </div>
        )}

        {(!showDescription || !photo) && (
          <div className="-mt-3 flex gap-2">
            {!showDescription && (
              <Chip on={false} onClick={() => setShowDescription(true)}>
                <AlignLeft size={15} /> Descrizione
              </Chip>
            )}
            {!photo && (
              <Chip on={false} onClick={() => input.current?.click()}>
                <ImagePlus size={15} /> Foto
              </Chip>
            )}
          </div>
        )}
        <input
          ref={input}
          type="file"
          accept={ACCEPTED}
          hidden
          aria-label="Foto del sondaggio"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) setPhoto({ file: f, url: URL.createObjectURL(f) });
            e.target.value = "";
          }}
        />

        <Field label="Argomento">
          <TopicPicker suggestions={categories} value={category} onChange={setCategory} />
        </Field>

        <Field label="Quanto dura">
          <ChipRow label="Quanto dura">
            {DURATIONS.map((d) => (
              <Chip key={d.label} on={days === d.days} onClick={() => setDays(d.days)}>
                {d.label}
              </Chip>
            ))}
          </ChipRow>
        </Field>

        <Field label="Dove">
          <WherePicker kind="poll" scope={scope} city={city} onChange={(sc, c) => { setScope(sc); setCity(c); }} audience={audience} onAudience={setAudience} />
        </Field>

        <PublishNote />
      </form>
    </Sheet>
  );
}

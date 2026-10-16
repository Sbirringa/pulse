import { useState, type ReactNode } from "react";
import { Check, Plus, X } from "lucide-react";

/** Una riga di "pillole" che scorre di lato: occupa una sola riga anche con tante opzioni. */
export function ChipRow({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="-mx-5 overflow-x-auto px-5 no-scrollbar" role="group" aria-label={label} data-noswipe>
      <div className="flex w-max gap-2 pb-0.5">{children}</div>
    </div>
  );
}

export function Chip({ on, onClick, children, label }: { on: boolean; onClick: () => void; children: ReactNode; label?: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={label}
      onClick={onClick}
      className={`flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13.5px] font-semibold transition ${
        on ? "border border-zinc-50 bg-zinc-50 text-ink" : "border border-line text-zinc-300 hover:border-zinc-600 hover:text-white"
      }`}
    >
      {children}
    </button>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-2.5 text-[13.5px] font-semibold text-zinc-200">
        {label}
        {hint && <span className="ml-1 font-normal text-zinc-500">{hint}</span>}
      </p>
      {children}
    </div>
  );
}

/**
 * Argomento: quelli proposti in una sola riga + "Nuovo" per scriverne uno proprio.
 * Toccando di nuovo l'argomento scelto lo si toglie.
 */
export function TopicPicker({
  suggestions,
  value,
  onChange,
}: {
  suggestions: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  const [writing, setWriting] = useState(false);
  const [draft, setDraft] = useState("");
  const custom = value && !suggestions.includes(value) ? value : null;

  function confirm() {
    const v = draft.replace(/\s+/g, " ").trim();
    if (v.length >= 2) onChange(v.charAt(0).toUpperCase() + v.slice(1));
    setWriting(false);
    setDraft("");
  }

  if (writing) {
    return (
      <div className="flex items-center gap-2">
        <input
          autoFocus
          value={draft}
          maxLength={24}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              confirm();
            }
            if (e.key === "Escape") {
              e.stopPropagation();
              setWriting(false);
            }
          }}
          placeholder="Scrivi un argomento (es. Parchi)"
          aria-label="Nuovo argomento"
          className="h-9 min-w-0 flex-1 rounded-full border border-line bg-raised px-4 text-sm outline-none placeholder:text-zinc-500 focus:border-pulse/60"
        />
        <button type="button" onClick={confirm} disabled={draft.trim().length < 2} aria-label="Aggiungi argomento" className="rounded-full bg-pulse p-2 text-ink disabled:opacity-40">
          <Check size={18} />
        </button>
        <button type="button" onClick={() => setWriting(false)} aria-label="Annulla" className="rounded-full bg-white/[0.06] p-2 text-zinc-300">
          <X size={18} />
        </button>
      </div>
    );
  }

  return (
    <ChipRow label="Argomento">
      <Chip on={false} onClick={() => setWriting(true)} label="Nuovo argomento">
        <Plus size={15} /> Nuovo
      </Chip>
      {custom && (
        <Chip on onClick={() => onChange("")}>
          {custom}
        </Chip>
      )}
      {suggestions.map((c) => (
        <Chip key={c} on={value === c} onClick={() => onChange(value === c ? "" : c)}>
          {c}
        </Chip>
      ))}
    </ChipRow>
  );
}

/** Avviso standard sotto ogni post e sondaggio: regole della comunità e responsabilità di chi pubblica. */
export function PublishNote() {
  return (
    <p className="text-xs leading-5 text-zinc-500">
      Pubblica solo contenuti rispettosi e leciti: niente insulti, odio, minacce, notizie false o dati personali di altri.
      Pubblicando ti assumi la responsabilità di ciò che scrivi e condividi.
    </p>
  );
}

import { useEffect, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

const stack: object[] = [];

/** Pannello che sale dal basso (su desktop: finestra centrata). Si chiude con X, Esc o toccando fuori. */
export default function Sheet({
  title,
  onClose,
  children,
  tall = false,
  footer,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** quasi a tutto schermo (per scrivere un post o un sondaggio senza distrazioni) */
  tall?: boolean;
  /** pulsanti sempre visibili in fondo (es. Pubblica) */
  footer?: ReactNode;
}) {
  useEffect(() => {
    document.body.style.overflow = "hidden";
    const me = {};
    stack.push(me);
    // con due pannelli aperti (es. scelta della città sopra il sondaggio) Esc chiude solo quello sopra
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && stack[stack.length - 1] === me && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      stack.splice(stack.indexOf(me), 1);
      if (stack.length === 0) document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
      className="fixed inset-0 z-40 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`sheet-in flex w-full max-w-md flex-col ${tall ? "h-[94dvh] sm:h-auto sm:max-h-[90dvh] sm:max-w-lg" : "max-h-[85dvh]"} rounded-t-[1.75rem] border border-line bg-panel shadow-2xl shadow-black/40 sm:rounded-[1.5rem]`}
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="mx-auto mt-2.5 h-1.5 w-10 rounded-full bg-white/15 sm:hidden" />
        <div className="flex items-center justify-between px-5 pb-3 pt-3 sm:pt-4">
          <h2 className="font-display text-[1.2rem] font-bold tracking-[-0.02em] text-zinc-50">{title}</h2>
          <button onClick={onClose} aria-label="Chiudi" className="flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.06] text-zinc-300 transition hover:bg-white/[0.12] hover:text-white">
            <X size={18} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">{children}</div>
        {footer && <div className="border-t border-line px-5 pb-4 pt-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

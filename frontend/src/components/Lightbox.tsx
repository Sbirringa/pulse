import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import type { ImageRef } from "../types";

/** Visualizzatore a schermo intero: si chiude con la X, con Esc o toccando fuori dalla foto. */
export default function Lightbox({
  images,
  start = 0,
  caption,
  onClose,
}: {
  images: ImageRef[];
  start?: number;
  caption?: string;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(start);
  const [loaded, setLoaded] = useState(false);
  const img = images[index];
  const many = images.length > 1;

  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden"; // la pagina sotto non scorre
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setIndex((i) => Math.min(images.length - 1, i + 1));
      if (e.key === "ArrowLeft") setIndex((i) => Math.max(0, i - 1));
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [images.length, onClose]);

  useEffect(() => setLoaded(false), [index]);

  if (!img) return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Foto"
      onClick={onClose}
      className="fixed inset-0 z-50 flex flex-col bg-black/95"
    >
      <div className="flex items-center justify-between px-4 py-3" onClick={(e) => e.stopPropagation()}>
        <span className="text-sm text-zinc-400">{many ? `${index + 1} / ${images.length}` : caption ?? ""}</span>
        <button
          onClick={onClose}
          aria-label="Chiudi foto"
          className="rounded-full bg-white/10 p-2.5 text-white hover:bg-white/20"
        >
          <X size={22} />
        </button>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center px-2 pb-6">
        {!loaded && <div className="absolute h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-pulse" />}
        <img
          key={img.id}
          src={img.lg}
          alt=""
          width={img.w}
          height={img.h}
          onLoad={() => setLoaded(true)}
          onClick={(e) => e.stopPropagation()}
          className={`max-h-full max-w-full rounded-lg object-contain transition-opacity ${loaded ? "opacity-100" : "opacity-0"}`}
        />
        {many && index > 0 && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIndex(index - 1);
            }}
            aria-label="Foto precedente"
            className="absolute left-3 rounded-full bg-black/60 p-2.5 text-white hover:bg-black/80"
          >
            <ChevronLeft size={24} />
          </button>
        )}
        {many && index < images.length - 1 && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setIndex(index + 1);
            }}
            aria-label="Foto successiva"
            className="absolute right-3 rounded-full bg-black/60 p-2.5 text-white hover:bg-black/80"
          >
            <ChevronRight size={24} />
          </button>
        )}
      </div>
    </div>,
    document.body,
  );
}

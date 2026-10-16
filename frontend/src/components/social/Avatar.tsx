import { useState } from "react";

const PALETTE = ["#c8ff3d", "#9aa8ff", "#ff9aa6", "#ffd27a", "#7fe0d0", "#d2b6ff", "#ffb38a"];

/** Foto profilo; se manca (o non si carica) mostra l'iniziale su un colore stabile. */
export default function Avatar({
  name,
  src,
  size = 36,
  ring = false,
}: {
  name: string | null;
  src?: string | null;
  size?: number;
  ring?: boolean;
}) {
  const [broken, setBroken] = useState(false);
  const label = name ? name.trim()[0]?.toUpperCase() ?? "?" : "?";
  let hash = 0;
  for (const ch of name ?? "") hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  const color = name ? PALETTE[hash % PALETTE.length] : "#3a4260";
  const ringCls = ring ? "ring-2 ring-pulse ring-offset-2 ring-offset-ink" : "";
  if (src && !broken) {
    return (
      <img
        src={src}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        onError={() => setBroken(true)}
        className={`shrink-0 rounded-full bg-zinc-800 object-cover ${ringCls}`}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-black text-ink ${ringCls}`}
      style={{ width: size, height: size, background: color, fontSize: size * 0.42 }}
    >
      {label}
    </span>
  );
}

/** Il marchio: il polso a tre colori dentro una "P", più la scritta. */
export default function Logo({ size = "md" }: { size?: "md" | "lg" }) {
  const box = size === "lg" ? 44 : 32;
  const text = size === "lg" ? "text-[1.9rem]" : "text-[1.35rem]";
  return (
    <div className="flex items-center gap-2">
      <svg width={box} height={box} viewBox="0 0 32 32" aria-hidden>
        <rect width="32" height="32" rx="10" fill="#c8ff3d" />
        <path d="M5 17h5l2.5-6 4 12 3-9 1.6 3H27" fill="none" stroke="#0e1322" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className={`${text} font-display font-extrabold tracking-[-0.03em] text-zinc-50`}>pulse</span>
    </div>
  );
}

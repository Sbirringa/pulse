import type { ReactNode } from "react";
import { BarChart3, ChevronRight, ImagePlus } from "lucide-react";
import Sheet from "./social/Sheet";

function Choice({ icon, tone, title, text, onClick, label }: {
  icon: ReactNode; tone: string; title: string; text: string; onClick: () => void; label: string;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="group flex w-full items-center gap-4 rounded-2xl border border-line bg-raised p-4 text-left transition hover:border-zinc-600"
    >
      <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${tone}`}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block font-display text-[1.05rem] font-bold text-zinc-50">{title}</span>
        <span className="mt-0.5 block text-[13.5px] leading-5 text-zinc-400">{text}</span>
      </span>
      <ChevronRight size={19} className="shrink-0 text-zinc-600 transition group-hover:translate-x-0.5 group-hover:text-zinc-300" />
    </button>
  );
}

/** Il pulsante "+" al centro: cosa vuoi creare? */
export default function CreateSheet({
  onClose,
  onPost,
  onPoll,
}: {
  onClose: () => void;
  onPost: () => void;
  onPoll: () => void;
}) {
  return (
    <Sheet title="Crea" onClose={onClose}>
      <div className="space-y-2.5 pb-2">
        <Choice
          label="Nuovo post"
          onClick={onPost}
          tone="bg-pulse/[0.14] text-pulse"
          icon={<ImagePlus size={23} />}
          title="Post"
          text="Racconta cosa succede, con fino a 4 foto"
        />
        <Choice
          label="Nuovo sondaggio"
          onClick={onPoll}
          tone="bg-maybe/[0.14] text-maybe"
          icon={<BarChart3 size={23} />}
          title="Sondaggio"
          text="Una domanda con tre risposte, foto e scadenza"
        />
      </div>
    </Sheet>
  );
}

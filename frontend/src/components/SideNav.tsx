import type { ReactNode } from "react";
import { Activity, BarChart3, Bell, Newspaper, Plus, UserRound } from "lucide-react";
import type { Me } from "../types";
import type { InfoSlug } from "./info/InfoPages";
import Avatar from "./social/Avatar";

export type NavTab = "piazza" | "posts" | "polls" | "activity" | "profile";

/** Navigazione su computer: colonna a sinistra al posto della barra in basso. */
export default function SideNav({
  me,
  active,
  bell,
  onSelect,
  onCreate,
  onInfo,
}: {
  me: Me | null;
  active: NavTab | null;
  bell: number;
  onSelect: (t: NavTab) => void;
  onCreate: () => void;
  onInfo: (s: InfoSlug) => void;
}) {
  const item = (id: NavTab, label: string, icon: ReactNode, extra?: ReactNode) => {
    const on = active === id;
    return (
      <button
        key={id}
        onClick={() => onSelect(id)}
        aria-current={on ? "page" : undefined}
        className={`relative flex w-full items-center gap-3.5 rounded-2xl px-3.5 py-3 text-[15px] font-semibold transition ${
          on ? "bg-white/[0.06] text-zinc-50" : "text-zinc-400 hover:bg-white/[0.04] hover:text-zinc-100"
        }`}
      >
        {on && <span aria-hidden className="absolute -left-1 top-3 bottom-3 w-[3px] rounded-full bg-pulse" />}
        <span className="relative">{icon}{extra}</span>
        {label}
      </button>
    );
  };
  const links: [InfoSlug, string][] = [
    ["ecosistema", "Ecosistema"],
    ["sicurezza", "Sicurezza"],
    ["open-source", "Open source"],
    ["termini", "Termini"],
    ["privacy", "Privacy"],
  ];
  return (
    <nav aria-label="Navigazione" className="flex flex-col gap-1">
      {item("piazza", "Pulse", <Activity size={21} strokeWidth={2.2} />)}
      {item("posts", "Post", <Newspaper size={21} />)}
      {item("polls", "Sondaggi", <BarChart3 size={21} />)}
      {item(
        "activity",
        "Attività",
        <Bell size={21} />,
        bell > 0 ? (
          <span className="absolute -right-2 -top-1.5 flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-no px-1 text-[10px] font-bold text-ink ring-2 ring-ink">
            {bell > 99 ? "99+" : bell}
          </span>
        ) : null,
      )}
      {item("profile", "Profilo", me ? <Avatar name={me.name ?? me.nickname} src={me.avatar} size={21} /> : <UserRound size={21} />)}

      <button
        onClick={onCreate}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-pulse py-3.5 font-display text-[15px] font-extrabold text-ink transition hover:brightness-110"
      >
        <Plus size={19} strokeWidth={2.6} /> Crea
      </button>

      <div className="mt-8 flex flex-wrap gap-x-3 gap-y-1.5 px-1 text-xs text-zinc-500">
        {links.map(([slug, label]) => (
          <button key={slug} onClick={() => onInfo(slug)} className="hover:text-zinc-200">
            {label}
          </button>
        ))}
      </div>
      <p className="mt-3 px-1 text-[11px] text-zinc-600">PULSE · codice aperto, fatto in Italia</p>
    </nav>
  );
}

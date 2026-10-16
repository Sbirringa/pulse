import type { ReactNode } from "react";
import { ChevronRight, CodeXml, FileLock2, Orbit, ScrollText, ShieldCheck } from "lucide-react";
import type { Meta } from "../../types";
import Logo from "../Logo";
import Sheet from "../social/Sheet";
import type { InfoSlug } from "./InfoPages";

function Item({ icon, title, text, badge, onClick, href }: {
  icon: ReactNode; title: string; text: string; badge?: string; onClick?: () => void; href?: string;
}) {
  const inner = (
    <>
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/[0.06] text-pulse">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2 text-[15px] font-semibold text-zinc-50">
          {title}
          {badge && <span className="rounded-full bg-pulse/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-pulse">{badge}</span>}
        </span>
        <span className="block truncate text-xs text-zinc-500">{text}</span>
      </span>
      <ChevronRight size={17} className="shrink-0 text-zinc-600" />
    </>
  );
  const cls = "flex w-full items-center gap-3.5 rounded-2xl px-2 py-2.5 text-left transition hover:bg-white/[0.05]";
  return href ? <a href={href} className={cls}>{inner}</a> : <button onClick={onClick} className={cls}>{inner}</button>;
}

/** Il menu in alto: cos'è Pulse, sicurezza, codice aperto, regole e privacy. */
export default function InfoMenu({ meta, onOpen, onClose }: { meta: Meta; onOpen: (s: InfoSlug) => void; onClose: () => void }) {
  return (
    <Sheet title="Pulse" onClose={onClose}>
      <div className="mb-3 flex items-center gap-3 rounded-[1.5rem] bg-gradient-to-br from-pulse/[0.14] to-transparent p-4 ring-1 ring-white/[0.07]">
        <Logo />
        <p className="text-xs leading-5 text-zinc-400">Il polso della tua città, in tempo reale.</p>
      </div>
      <nav aria-label="Informazioni su Pulse" className="space-y-0.5 pb-1">
        <Item icon={<Orbit size={20} />} title="Ecosistema" text="Tutto quello che c'è dentro Pulse" onClick={() => onOpen("ecosistema")} />
        <Item icon={<ShieldCheck size={20} />} title="Sicurezza" text="Crittografia, voto segreto, dati minimi" onClick={() => onOpen("sicurezza")} />
        <Item
          icon={<CodeXml size={20} />}
          title="Open source"
          text="Il codice è pubblico: controllalo tu"
          badge={meta.source_url ? undefined : "presto"}
          onClick={() => onOpen("open-source")}
        />
        <Item icon={<ScrollText size={20} />} title="Termini" text="Le regole della comunità" onClick={() => onOpen("termini")} />
        <Item icon={<FileLock2 size={20} />} title="Privacy" text="Quali dati trattiamo e perché" onClick={() => onOpen("privacy")} />
      </nav>
    </Sheet>
  );
}

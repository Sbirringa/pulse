import { useState } from "react";
import { confirmDialog } from "../../confirm";
import { Check, Clock, UserPlus } from "lucide-react";
import { api, errMsg } from "../../api";
import type { Profile, Relation } from "../../types";
import { useNav } from "../../nav";

/**
 * Un solo pulsante, quattro stati chiari:
 *  Segui → Richiesta inviata (tocca per annullare) → Segui già ✓ (tocca per smettere)
 *  "Segui anche tu" se l'altra persona ti segue già (in quel caso non serve approvazione).
 */
export default function FollowButton({
  nickname,
  relation,
  compact = false,
  onChange,
}: {
  nickname: string;
  relation: Relation;
  compact?: boolean;
  onChange: (p: Profile) => void;
}) {
  const { me, requireAuth } = useNav();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (relation.following === "self") return null;

  async function act() {
    setError("");
    if (!me) {
      requireAuth(`Entra per seguire @${nickname}`);
      return;
    }
    // smettere di seguire / annullare la richiesta: conferma nello stile dell'app
    if (relation.following !== "none") {
      const pending = relation.following === "pending";
      const ok = await confirmDialog(
        pending
          ? { title: "Annullare la richiesta?", detail: `@${nickname} non la vedrà più.`, yes: "Annulla richiesta", no: "Lascia", danger: true }
          : {
              title: `Smettere di seguire @${nickname}?`,
              detail: relation.follows_you
                ? `Non vedrai più i suoi post tra i Seguiti. @${nickname} continua a seguirti finché non lo togli dai follower.`
                : "Non vedrai più i suoi post tra i Seguiti. Non riceve nessun avviso.",
              yes: "Smetti di seguire",
              danger: true,
            },
      );
      if (!ok) return;
    }
    setBusy(true);
    try {
      onChange(relation.following === "none" ? await api.follow(nickname) : await api.unfollow(nickname));
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  const size = compact ? "px-3.5 py-1.5 text-xs" : "px-5 py-2.5 text-sm";
  let cls = "bg-pulse text-ink hover:brightness-110";
  let label = relation.follows_you ? "Segui anche tu" : "Segui";
  let icon: React.ReactNode = <UserPlus size={compact ? 14 : 16} />;
  if (relation.following === "pending") {
    cls = "border border-line text-zinc-300 hover:border-zinc-600";
    label = "Richiesta inviata";
    icon = <Clock size={compact ? 14 : 16} />;
  } else if (relation.following === "accepted") {
    cls = "border border-line text-zinc-100 hover:border-zinc-600";
    label = "Segui già";
    icon = <Check size={compact ? 14 : 16} />;
  }

  return (
    <span className="inline-flex flex-col items-stretch">
      <button
        onClick={act}
        disabled={busy}
        className={`inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-full font-bold transition active:scale-[0.97] disabled:opacity-50 ${size} ${cls}`}
      >
        {icon}
        {label}
      </button>
      {error && <span className="mt-1 text-xs text-no">{error}</span>}
    </span>
  );
}

import { useState, type FormEvent, type ReactNode } from "react";
import { Lock } from "lucide-react";
import { api, errMsg } from "../../api";
import type { Me } from "../../types";
import AvatarPicker from "./AvatarPicker";
import Sheet from "./Sheet";

const inputCls =
  "mt-1.5 w-full rounded-2xl border border-line bg-raised px-4 py-3 text-base outline-none placeholder:text-zinc-600 focus:border-pulse";

function Toggle({ title, hint, checked, disabled, onChange, icon, testId }: {
  title: string; hint: ReactNode; checked: boolean; disabled?: boolean; onChange: (v: boolean) => void; icon?: ReactNode; testId?: string;
}) {
  return (
    <label className={`flex items-start justify-between gap-4 rounded-2xl bg-black/30 p-4 ${disabled ? "opacity-60" : "cursor-pointer"}`}>
      <span>
        <span className="flex items-center gap-1.5 text-sm font-bold">{icon}{title}</span>
        <span className="mt-0.5 block text-xs leading-5 text-zinc-500">{hint}</span>
      </span>
      <input type="checkbox" role="switch" aria-label={title} data-testid={testId} checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span aria-hidden className="relative mt-1 h-7 w-12 shrink-0 rounded-full bg-white/15 transition peer-checked:bg-pulse peer-focus-visible:ring-2 peer-focus-visible:ring-pulse after:absolute after:left-1 after:top-1 after:h-5 after:w-5 after:rounded-full after:bg-white after:transition peer-checked:after:translate-x-5" />
    </label>
  );
}

export default function EditProfileSheet({ me, onClose, onSaved }: { me: Me; onClose: () => void; onSaved: (m: Partial<Me>) => void }) {
  const [name, setName] = useState(me.name ?? "");
  const [bio, setBio] = useState(me.bio ?? "");
  const [approve, setApprove] = useState(me.approve_followers);
  const [priv, setPriv] = useState(!!me.is_private);
  const [avatar, setAvatar] = useState(me.avatar);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await api.updateProfile({ display_name: name, bio, is_private: priv, approve_followers: priv || approve });
      onSaved({ ...r, avatar });
      onClose();
    } catch (err) {
      setError(errMsg(err));
      setBusy(false);
    }
  }

  async function removePhoto() {
    try {
      await api.deleteAvatar();
      setAvatar(null);
      onSaved({ avatar: null });
    } catch (err) {
      setError(errMsg(err));
    }
  }

  return (
    <Sheet title="Modifica profilo" onClose={onClose}>
      <form onSubmit={save} className="space-y-4">
        <div className="flex flex-col items-center gap-2 pt-1">
          <AvatarPicker name={name || me.nickname} avatar={avatar} onChange={(url) => { setAvatar(url); onSaved({ avatar: url }); }} />
          {avatar && (
            <button type="button" onClick={removePhoto} className="text-xs font-semibold text-zinc-500 hover:text-no">
              Rimuovi foto
            </button>
          )}
        </div>
        <label className="block text-sm text-zinc-300">
          Nome e cognome
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoComplete="name" placeholder="Es. Giulia Rossi" className={inputCls} />
        </label>
        <label className="block text-sm text-zinc-300">
          Bio
          <textarea value={bio} onChange={(e) => setBio(e.target.value)} maxLength={160} rows={3} placeholder="Due parole su di te e su cosa ti sta a cuore" className={`${inputCls} resize-none`} />
          <span className="mt-1 block text-right text-xs text-zinc-600">{bio.length}/160</span>
        </label>
        <Toggle
          title="Profilo privato"
          icon={<Lock size={14} className="text-pulse" />}
          testId="private-toggle"
          checked={priv}
          onChange={setPriv}
          hint={priv
            ? "I tuoi post e sondaggi li vede solo chi vi seguite a vicenda. Nome, foto e bio restano visibili."
            : "Profilo pubblico: tutti vedono i tuoi post e sondaggi."}
        />
        <Toggle
          title="Approva chi vuole seguirti"
          checked={priv || approve}
          disabled={priv}
          onChange={setApprove}
          hint={priv ? "Con il profilo privato le richieste le approvi sempre tu." : approve ? "Ricevi una richiesta e decidi tu." : "Chiunque può seguirti subito."}
        />
        <p className="px-1 text-xs leading-5 text-zinc-500">Gli elenchi di follower e seguiti li vedi solo tu: agli altri compaiono solo i numeri.</p>
        {error && <p role="alert" className="rounded-xl bg-no/10 px-3 py-2 text-sm text-no">{error}</p>}
        <button disabled={busy} className="w-full rounded-2xl bg-pulse py-3.5 font-extrabold text-ink hover:brightness-110 disabled:opacity-50">
          {busy ? "Salvo…" : "Salva"}
        </button>
      </form>
    </Sheet>
  );
}

import { useRef, useState } from "react";
import { Camera } from "lucide-react";
import { api, errMsg } from "../../api";
import { ACCEPTED, prepareImage } from "../../imageResize";
import Avatar from "./Avatar";

/** Foto profilo grande e tonda: toccala per sceglierne una nuova. */
export default function AvatarPicker({
  name,
  avatar,
  size = 112,
  onChange,
}: {
  name: string;
  avatar: string | null;
  size?: number;
  onChange: (url: string | null) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function pick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.append("image", await prepareImage(file));
      onChange((await api.uploadAvatar(form)).avatar);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-center">
      <input ref={input} type="file" accept={ACCEPTED} hidden onChange={(e) => { void pick(e.target.files?.[0]); e.target.value = ""; }} />
      <button
        type="button"
        onClick={() => input.current?.click()}
        aria-label={avatar ? "Cambia foto profilo" : "Aggiungi foto profilo"}
        className="group relative rounded-full"
        disabled={busy}
      >
        <Avatar name={name} src={avatar} size={size} />
        <span className="absolute bottom-0 right-0 flex h-9 w-9 items-center justify-center rounded-full border-4 border-ink bg-pulse text-ink transition group-hover:scale-110">
          <Camera size={16} />
        </span>
        {busy && (
          <span className="absolute inset-0 flex items-center justify-center rounded-full bg-black/60">
            <span className="h-7 w-7 animate-spin rounded-full border-2 border-white/30 border-t-pulse" />
          </span>
        )}
      </button>
      {error && <p className="mt-2 max-w-xs text-center text-xs text-no">{error}</p>}
    </div>
  );
}

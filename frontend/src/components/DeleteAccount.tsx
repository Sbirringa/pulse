import { useState, type FormEvent } from "react";
import { Trash2 } from "lucide-react";
import { api, errMsg } from "../api";

export default function DeleteAccount({ onDeleted }: { onDeleted: () => void }) {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api.deleteAccount(password);
      onDeleted();
    } catch (err) {
      setError(errMsg(err));
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 text-sm text-zinc-500 hover:text-no"
      >
        <Trash2 size={15} /> Elimina il mio account
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="rounded-3xl border border-rose-400/30 bg-rose-500/[0.05] p-5">
      <h2 className="text-base font-extrabold text-rose-200">Eliminare l'account?</h2>
      <p className="mt-2 text-sm leading-6 text-zinc-400">
        Cancelliamo subito account, risposte e proposte non ancora pubblicate. Le proposte già pubblicate restano,
        senza alcun collegamento a te. <strong className="text-zinc-200">Non si può annullare.</strong>
      </p>
      <label className="mt-4 block text-sm text-zinc-300">
        Conferma con la tua password
        <input
          required
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1.5 w-full rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-base outline-none focus:border-rose-300"
        />
      </label>
      {error && (
        <p role="alert" className="mt-3 rounded-xl bg-no/10 px-3 py-2 text-sm text-no">
          {error}
        </p>
      )}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setPassword("");
            setError("");
          }}
          className="rounded-xl border border-white/15 py-3 text-sm font-bold hover:bg-white/5"
        >
          Annulla
        </button>
        <button
          disabled={busy || !password}
          className="rounded-xl bg-rose-500 py-3 text-sm font-extrabold text-white hover:bg-rose-400 disabled:opacity-50"
        >
          {busy ? "Elimino…" : "Elimina per sempre"}
        </button>
      </div>
    </form>
  );
}

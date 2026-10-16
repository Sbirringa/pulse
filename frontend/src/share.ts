/** Condivide un link con il foglio di condivisione nativo; altrimenti lo copia negli appunti. */
export async function shareLink(opts: { title: string; text: string; path: string }): Promise<"shared" | "copied" | "failed"> {
  const url = `${window.location.origin}${opts.path}`;
  try {
    if (navigator.share) {
      await navigator.share({ title: opts.title, text: opts.text, url });
      return "shared";
    }
    await navigator.clipboard.writeText(url);
    return "copied";
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") return "shared"; // l'utente ha annullato
    try {
      await navigator.clipboard.writeText(url);
      return "copied";
    } catch {
      return "failed";
    }
  }
}

/** Condivide un'immagine (card) se possibile, altrimenti la scarica. */
export async function shareImage(blob: Blob, filename: string, text: string): Promise<"shared" | "downloaded"> {
  const file = new File([blob], filename, { type: blob.type });
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: "PULSE", text });
      return "shared";
    }
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") return "shared";
  }
  const href = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 2000);
  return "downloaded";
}

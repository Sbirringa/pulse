/**
 * Riduce una foto nel browser prima dell'invio (max 2048 px, JPEG): upload molto più veloci da
 * telefono e meno traffico. Ricodificando, il browser elimina anche i metadati (posizione GPS).
 * Il server ripulisce e ricontrolla comunque tutto: questa è solo un'ottimizzazione.
 * Se il browser non riesce a leggere il file, si invia l'originale.
 */
const MAX_SIDE = 2048;
export const ACCEPTED = "image/jpeg,image/png,image/webp";

export async function prepareImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 1.5 * 1024 * 1024 && file.type !== "image/png") {
      bitmap.close();
      return file; // già leggera: si lascia com'è
    }
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.fillStyle = "#ffffff"; // le trasparenze PNG diventano bianche nel JPEG
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.88));
    if (!blob) return file;
    const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg" });
  } catch {
    return file;
  }
}

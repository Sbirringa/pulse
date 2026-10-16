import type { PulseData } from "./types";

const LIME = "#c8ff3d";

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Disegna la card "Il tuo Pulse" (1080x1350, formato feed) e la restituisce come PNG. */
export function renderPulseCard(data: PulseData, nickname: string): Promise<Blob> {
  const W = 1080;
  const H = 1350;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const font = (size: number, weight = 800) =>
    `${weight} ${size}px ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif`;

  // sfondo
  ctx.fillStyle = "#0e1322";
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W * 0.85, 120, 20, W * 0.85, 120, 700);
  glow.addColorStop(0, "rgba(200,255,61,0.30)");
  glow.addColorStop(1, "rgba(200,255,61,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // logo
  ctx.fillStyle = LIME;
  roundRect(ctx, 80, 80, 84, 84, 22);
  ctx.fill();
  ctx.fillStyle = "#0e1322";
  ctx.beginPath();
  ctx.moveTo(130, 94);
  ctx.lineTo(100, 126);
  ctx.lineTo(122, 126);
  ctx.lineTo(114, 150);
  ctx.lineTo(146, 114);
  ctx.lineTo(124, 114);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#f4f4f2";
  ctx.font = font(64, 900);
  ctx.textBaseline = "alphabetic";
  ctx.fillText("PULSE", 188, 140);
  ctx.fillStyle = LIME;
  ctx.fillText(".", 188 + ctx.measureText("PULSE").width, 140);

  // nickname
  ctx.fillStyle = "#a1a1a0";
  ctx.font = font(40, 600);
  ctx.fillText(`@${nickname}`, 80, 280);

  // numero grande
  const hasAlign = data.aligned_pct !== null;
  const big = hasAlign ? `${data.aligned_pct}%` : String(data.answered);
  ctx.fillStyle = LIME;
  ctx.font = font(330, 900);
  ctx.fillText(big, 70, 640);
  ctx.fillStyle = "#f4f4f2";
  ctx.font = font(52, 800);
  const label = hasAlign
    ? ["in sintonia con gli altri", "partecipanti di PULSE"]
    : ["questioni a cui ho", "risposto su PULSE"];
  ctx.fillText(label[0], 80, 730);
  ctx.fillText(label[1], 80, 795);

  // statistiche
  const stats: [string, string][] = [
    [String(data.answered), "risposte"],
    [String(data.streak), data.streak === 1 ? "giorno di fila" : "giorni di fila"],
  ];
  let sx = 80;
  for (const [value, name] of stats) {
    ctx.fillStyle = "rgba(255,255,255,0.06)";
    roundRect(ctx, sx, 870, 440, 150, 28);
    ctx.fill();
    ctx.fillStyle = "#f4f4f2";
    ctx.font = font(72, 900);
    ctx.fillText(value, sx + 36, 950);
    ctx.fillStyle = "#a1a1a0";
    ctx.font = font(32, 600);
    ctx.fillText(name, sx + 36, 998);
    sx += 480;
  }

  // categorie
  let cx = 80;
  const cy = 1090;
  ctx.font = font(34, 700);
  for (const c of data.categories.slice(0, 3)) {
    const w = ctx.measureText(c.category).width + 56;
    if (cx + w > W - 80) break;
    ctx.strokeStyle = "rgba(200,255,61,0.7)";
    ctx.lineWidth = 3;
    roundRect(ctx, cx, cy, w, 74, 37);
    ctx.stroke();
    ctx.fillStyle = LIME;
    ctx.fillText(c.category, cx + 28, cy + 50);
    cx += w + 20;
  }

  // piè di pagina
  ctx.fillStyle = "#f4f4f2";
  ctx.font = font(46, 900);
  ctx.fillText("Il battito della tua città.", 80, 1230);
  ctx.fillStyle = "#a1a1a0";
  ctx.font = font(30, 500);
  ctx.fillText(window.location.host, 80, 1280);
  ctx.font = font(24, 500);
  ctx.fillStyle = "#6f6f6d";
  ctx.fillText("Dati degli utenti dell'app, non un sondaggio rappresentativo.", 80, 1320);

  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Impossibile creare l'immagine"))), "image/png"),
  );
}

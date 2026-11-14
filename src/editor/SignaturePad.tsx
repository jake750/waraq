import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { useT } from "../i18n";
import { appKV } from "../files/kv";

const KEY = "signatures";
const MAX_SAVED = 6;
const INK = "#14204a";

export type Signature = { bytes: Uint8Array; w: number; h: number };

const toBytes = async (url: string) => new Uint8Array(await (await fetch(url)).arrayBuffer());
async function fromDataUrl(url: string): Promise<Signature> {
  const img = new Image();
  img.src = url;
  await img.decode();
  return { bytes: await toBytes(url), w: img.naturalWidth, h: img.naturalHeight };
}

/** The drawn strokes cropped to their bounds, as a transparent PNG data URL. */
function cropped(canvas: HTMLCanvasElement): string | null {
  const ctx = canvas.getContext("2d")!;
  const { width, height } = canvas;
  const data = ctx.getImageData(0, 0, width, height).data;
  let [x0, y0, x1, y1] = [width, height, -1, -1];
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      if (data[(y * width + x) * 4 + 3] > 0) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
  if (x1 < 0) return null;
  const pad = 6;
  x0 = Math.max(0, x0 - pad);
  y0 = Math.max(0, y0 - pad);
  x1 = Math.min(width - 1, x1 + pad);
  y1 = Math.min(height - 1, y1 + pad);
  const out = document.createElement("canvas");
  out.width = x1 - x0 + 1;
  out.height = y1 - y0 + 1;
  out.getContext("2d")!.drawImage(canvas, x0, y0, out.width, out.height, 0, 0, out.width, out.height);
  return out.toDataURL("image/png");
}

/** Draw a signature (or pick a saved one). Saved signatures stay on this device only. */
export default function SignaturePad({ onUse, onCancel }: { onUse(s: Signature): void; onCancel(): void }) {
  const t = useT();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [saved, setSaved] = useState<string[]>([]);
  const [empty, setEmpty] = useState(true);
  const [keep, setKeep] = useState(true);
  const kv = useRef(appKV());

  useEffect(() => {
    kv.current
      .get<string[]>(KEY)
      .then((v) => setSaved(Array.isArray(v) ? v : []))
      .catch(() => {});
    const c = canvas.current!;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    c.width = c.clientWidth * ratio;
    c.height = c.clientHeight * ratio;
    const ctx = c.getContext("2d")!;
    ctx.scale(ratio, ratio);
    ctx.lineCap = ctx.lineJoin = "round";
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2.6;
  }, []);

  // The stroke being drawn. Each new sample draws a quadratic curve between segment midpoints,
  // so the ink comes out smooth instead of a chain of straight pieces.
  const stroke = useRef<[number, number][] | null>(null);
  const pos = (e: { clientX: number; clientY: number }): [number, number] => {
    const r = canvas.current!.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  };
  const mid = (a: [number, number], b: [number, number]): [number, number] => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const extend = (pt: [number, number]) => {
    const pts = stroke.current!;
    const prev = pts[pts.length - 1];
    if (Math.hypot(pt[0] - prev[0], pt[1] - prev[1]) < 0.75) return;
    pts.push(pt);
    const ctx = canvas.current!.getContext("2d")!;
    const n = pts.length;
    ctx.beginPath();
    if (n === 2) {
      ctx.moveTo(...pts[0]);
      ctx.lineTo(...mid(pts[0], pts[1]));
    } else {
      ctx.moveTo(...mid(pts[n - 3], pts[n - 2]));
      ctx.quadraticCurveTo(...pts[n - 2], ...mid(pts[n - 2], pts[n - 1]));
    }
    ctx.stroke();
  };
  const endStroke = () => {
    const pts = stroke.current;
    stroke.current = null;
    if (!pts || pts.length < 2) return;
    const ctx = canvas.current!.getContext("2d")!;
    ctx.beginPath();
    ctx.moveTo(...mid(pts[pts.length - 2], pts[pts.length - 1]));
    ctx.lineTo(...pts[pts.length - 1]);
    ctx.stroke();
  };

  const clear = () => {
    const c = canvas.current!;
    c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
    setEmpty(true);
  };

  const use = async () => {
    const url = cropped(canvas.current!);
    if (!url) return;
    if (keep) {
      const next = [url, ...saved.filter((s) => s !== url)].slice(0, MAX_SAVED);
      setSaved(next);
      await kv.current.set(KEY, next).catch(() => {});
    }
    onUse(await fromDataUrl(url));
  };

  const forget = async (url: string) => {
    const next = saved.filter((s) => s !== url);
    setSaved(next);
    await kv.current.set(KEY, next).catch(() => {});
  };

  return (
    <>
      <div className="scrim" onClick={onCancel} />
      <div className="dialog sig-dialog" role="dialog" aria-modal="true" aria-labelledby="sig-title" onKeyDown={(e) => e.key === "Escape" && onCancel()}>
        <h2 id="sig-title">{t.edSignTitle}</h2>
        {saved.length > 0 && (
          <div className="sig-saved">
            {saved.map((url) => (
              <div key={url} className="sig-chip">
                <button className="sig-pick" onClick={async () => onUse(await fromDataUrl(url))} aria-label={t.edSignUse}>
                  <img src={url} alt="" />
                </button>
                <button className="icon-btn sig-forget" onClick={() => forget(url)} aria-label={t.edSignForget} title={t.edSignForget}>
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
        <p className="sig-hint">{t.edSignHint}</p>
        <canvas
          ref={canvas}
          className="sig-canvas"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture(e.pointerId);
            const at = pos(e);
            stroke.current = [at];
            const ctx = canvas.current!.getContext("2d")!;
            ctx.beginPath();
            ctx.arc(at[0], at[1], 1.3, 0, Math.PI * 2);
            ctx.fillStyle = INK;
            ctx.fill();
            setEmpty(false);
          }}
          onPointerMove={(e) => {
            if (!stroke.current) return;
            const evs = e.nativeEvent.getCoalescedEvents?.() ?? [];
            for (const ev of evs.length ? evs : [e]) extend(pos(ev));
          }}
          onPointerUp={endStroke}
          onPointerCancel={endStroke}
        />
        <label className="check">
          <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} />
          <span>{t.edSignKeep}</span>
        </label>
        <div className="dialog-actions">
          <button className="btn btn-ghost" onClick={clear} disabled={empty}>
            {t.edSignClear}
          </button>
          <span className="spacer" />
          <button className="btn btn-ghost" onClick={onCancel}>
            {t.cancel}
          </button>
          <button className="btn btn-primary" onClick={use} disabled={empty}>
            {t.edSignUse}
          </button>
        </div>
      </div>
    </>
  );
}

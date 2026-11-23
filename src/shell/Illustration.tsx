// Small paper drawings for empty states. Drawn from colour roles (surface, stroke, accent), so they
// follow the theme; decorative only (the text next to them says what's going on).

type Kind = "sheets" | "search" | "outline";

const sheet = "var(--surface)";
const edge = "var(--stroke-strong)";
const line = "var(--stroke)";
const ink = "var(--accent-text)";
const flap = "var(--fold-flap)";

/** A sheet with the folded corner, its text lines and a top-left at (x, y). */
function Page({ x, y, lines = 4, rot = 0 }: { x: number; y: number; lines?: number; rot?: number }) {
  return (
    <g transform={`rotate(${rot} ${x + 24} ${y + 30})`}>
      <path d={`M${x} ${y}h36l12 12v48h-48z`} fill={sheet} stroke={edge} strokeWidth="1.5" strokeLinejoin="round" />
      <path d={`M${x + 36} ${y}v12h12`} fill={flap} stroke={edge} strokeWidth="1.5" strokeLinejoin="round" />
      {Array.from({ length: lines }, (_, i) => (
        <path key={i} d={`M${x + 8} ${y + 22 + i * 8}h${i === lines - 1 ? 18 : 32}`} stroke={line} strokeWidth="2.5" strokeLinecap="round" />
      ))}
    </g>
  );
}

export default function Illustration({ kind }: { kind: Kind }) {
  return (
    <svg className="illustration" width="96" height="80" viewBox="0 0 96 80" aria-hidden focusable="false">
      {kind === "sheets" && (
        <>
          <Page x={18} y={12} rot={-8} lines={3} />
          <Page x={30} y={8} rot={5} lines={3} />
          <Page x={24} y={10} />
          <path d="M32 54h20" stroke={ink} strokeWidth="2.5" strokeLinecap="round" />
        </>
      )}
      {kind === "search" && (
        <>
          <Page x={18} y={8} />
          <circle cx="58" cy="46" r="13" fill={sheet} stroke={ink} strokeWidth="3" />
          <path d="M67.5 55.5 78 66" stroke={ink} strokeWidth="4" strokeLinecap="round" />
        </>
      )}
      {kind === "outline" && (
        <>
          <Page x={24} y={8} lines={0} />
          {[0, 1, 2, 3].map((i) => (
            <g key={i}>
              <circle cx={i % 2 ? 40 : 34} cy={30 + i * 9} r="2" fill={ink} />
              <path d={`M${i % 2 ? 46 : 40} ${30 + i * 9}h${i % 2 ? 16 : 22}`} stroke={line} strokeWidth="2.5" strokeLinecap="round" />
            </g>
          ))}
        </>
      )}
    </svg>
  );
}

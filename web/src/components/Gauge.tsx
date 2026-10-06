// A half-circle risk gauge, drawn with SVG. The colour follows the decision, and the number is always shown.

const HALF_CIRCLE = Math.PI * 50;

export function Gauge({ score, action, label = "Risk" }: { score: number; action: string; label?: string }) {
  const filled = (Math.max(0, Math.min(100, score)) / 100) * HALF_CIRCLE;
  return (
    <svg className={`gauge ${action}`} viewBox="0 0 120 74" role="img" aria-label={`${label} ${score} out of 100`}>
      <path d="M10 64 A50 50 0 0 1 110 64" className="gauge-track" fill="none" strokeWidth="10" strokeLinecap="round" />
      <path
        d="M10 64 A50 50 0 0 1 110 64"
        className="gauge-fill"
        fill="none"
        strokeWidth="10"
        strokeLinecap="round"
        strokeDasharray={`${filled} ${HALF_CIRCLE + 2}`}
      />
      <text x="60" y="58" textAnchor="middle" className="gauge-number">
        {score}
      </text>
      <text x="60" y="72" textAnchor="middle" className="gauge-label">
        {label.toUpperCase()}
      </text>
    </svg>
  );
}

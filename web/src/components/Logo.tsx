// Last Mile Guard mark: a shield with a pulse line on a tile filled with the current theme's gradient.
export function Logo({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" role="img" aria-label="Last Mile Guard logo">
      <defs>
        <linearGradient id="ps-grad" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" style={{ stopColor: "var(--accent)" }} />
          <stop offset="1" style={{ stopColor: "var(--accent-2)" }} />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="60" height="60" rx="16" fill="url(#ps-grad)" />
      <path d="M32 12 47 18v12c0 10-6.5 17-15 21-8.5-4-15-11-15-21V18Z" fill="none" stroke="#ffffff" strokeOpacity="0.9" strokeWidth="3" strokeLinejoin="round" />
      <path d="M19 33h7l3-7 5 13 3-6h8" fill="none" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

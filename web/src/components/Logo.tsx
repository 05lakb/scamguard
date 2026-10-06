export function Logo({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" role="img" aria-label="Last Mile Guard logo">
      <defs>
        <linearGradient id="lmgShield" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#14396B" />
          <stop offset="1" stopColor="#0A1F3D" />
        </linearGradient>
      </defs>
      <path d="M256 40 L440 110 V250 C440 360 360 440 256 480 C152 440 72 360 72 250 V110 Z" fill="url(#lmgShield)" />
      <circle cx="150" cy="392" r="8" fill="#2DD4BF" opacity="0.5" />
      <circle cx="182" cy="352" r="10" fill="#2DD4BF" opacity="0.65" />
      <circle cx="218" cy="318" r="12" fill="#2DD4BF" opacity="0.85" />
      <circle cx="258" cy="286" r="14" fill="#2DD4BF" />
      <circle cx="306" cy="212" r="62" fill="#0A1F3D" stroke="#2DD4BF" strokeWidth="16" />
      <path d="M280 214 L300 236 L335 190" fill="none" stroke="#FFFFFF" strokeWidth="16" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

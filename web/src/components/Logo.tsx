export function Logo({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" role="img" aria-label="FinGuard AI logo">
      <path d="M256 36 438 106v144c0 111-73 187-182 226C147 437 74 361 74 250V106Z" fill="#17203A" />
      <path d="M256 78 399 133v115c0 82-50 145-143 182-93-37-143-100-143-182V133Z" fill="none" stroke="#8FAAFF" strokeWidth="14" />
      <path d="m161 270 62 62 128-145" fill="none" stroke="#FF9B83" strokeWidth="28" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

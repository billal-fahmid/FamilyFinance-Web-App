export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} role="img" aria-label="Family Finance">
      <defs>
        <linearGradient id="ffcoin" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FBBF24" />
          <stop offset="1" stopColor="#F97316" />
        </linearGradient>
      </defs>
      <path d="M24 4 6 17v3h4v22h28V20h4v-3L24 4z" fill="#16A34A" />
      <path d="M24 8.5 10.5 18.5V40h27V18.5L24 8.5z" fill="#0F7C3F" />
      <path
        d="M8 40c0-9 7-16 16-16s16 7 16 16"
        fill="none"
        stroke="#0057B8"
        strokeWidth="3.4"
        strokeLinecap="round"
      />
      <circle cx="24" cy="30" r="8.5" fill="url(#ffcoin)" />
      <circle cx="24" cy="30" r="8.5" fill="none" stroke="#B45309" strokeWidth="1" />
      <text
        x="24"
        y="34.5"
        textAnchor="middle"
        fontFamily="'Segoe UI', system-ui, sans-serif"
        fontSize="11"
        fontWeight="800"
        fill="#7C2D12"
      >
        ৳
      </text>
    </svg>
  );
}

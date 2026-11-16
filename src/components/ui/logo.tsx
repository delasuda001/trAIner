/** Marque trAIner : une foulée qui monte, sur un carré braise. */
export function LogoMark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
      <defs>
        <linearGradient id="trainer-mark" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ff8a3d" />
          <stop offset="1" stopColor="#ff3d2e" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill="url(#trainer-mark)" />
      <path d="M6 21.5h5l2.6-6.5 3.6 10 3.2-8.5H26" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="26" cy="9" r="2.4" fill="#fff" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="brand-word">
      tr<span className="ai">AI</span>ner
    </span>
  );
}

import { BRAND } from "@/lib/brand";

/**
 * Symbole Sillage : deux pastilles rose et bleu en surimpression, point jaune.
 * Couleurs et mode de fusion pris dans les jetons : le même SVG sert en clair et en sombre.
 */
export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      <g style={{ mixBlendMode: "var(--sl-blend)" as React.CSSProperties["mixBlendMode"] }}>
        <rect x="4" y="15" width="26" height="15" rx="7.5" transform="rotate(-24 17 22.5)" fill="var(--sl-pink)" />
        <rect x="17" y="21" width="26" height="15" rx="7.5" transform="rotate(-24 30 28.5)" fill="var(--sl-blue)" />
      </g>
      <circle cx="37" cy="10" r="5" fill="var(--sl-yellow)" stroke="#1C1B3A" strokeWidth="1.5" />
    </svg>
  );
}

/** Mot-symbole en texte HTML, une lettre en rose (le « i » de « sillage »). */
export function Wordmark() {
  const word = BRAND.wordmark;
  const index = BRAND.highlightIndex;
  return (
    <span className="brand-word">
      {word.slice(0, index)}
      <span className="ai">{word.charAt(index)}</span>
      {word.slice(index + 1)}
    </span>
  );
}

/** Logo Sillage (deux pastilles sur fond jaune) en JSX pour ImageResponse : icônes de l'écran d'accueil. */
export function BrandIcon({ size, padded = false }: { size: number; padded?: boolean }) {
  const unit = size / 48;
  // Icône « maskable » : marge de sécurité pour les recadrages d'Android.
  const scale = padded ? 0.78 : 1;
  const pill = (left: number, top: number, color: string) => (
    <div style={{ position: "absolute", left: (24 + (left - 24) * scale) * unit, top: (24 + (top - 24) * scale) * unit, width: 24 * unit * scale, height: 14 * unit * scale, borderRadius: 7 * unit * scale, background: color, transform: "rotate(-24deg)", opacity: 0.92 }} />
  );
  return (
    <div style={{ width: size, height: size, background: "#FFE800", display: "flex", position: "relative" }}>
      {pill(5, 17, "#FF48B0")}
      {pill(17, 22, "#0078BF")}
    </div>
  );
}

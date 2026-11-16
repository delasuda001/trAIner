export function Fact({ label, value, unit, sub }: { label: string; value: string; unit?: string; sub?: string }) {
  return (
    <div>
      <div className="fact-label">{label}</div>
      <div className="fact-value num">
        {value}
        {unit && value !== "—" ? <span className="unit">{unit}</span> : null}
      </div>
      {sub ? <div className="fact-sub">{sub}</div> : null}
    </div>
  );
}

export default function Loading() {
  return (
    <div style={{ paddingTop: 28 }} aria-busy="true" aria-label="Chargement">
      <div className="skeleton" style={{ height: 30, width: 240 }} />
      <div className="grid grid-2" style={{ marginTop: 24 }}>
        <div className="skeleton" style={{ height: 320, borderRadius: 14 }} />
        <div className="skeleton" style={{ height: 320, borderRadius: 14 }} />
      </div>
      <div className="grid grid-4" style={{ marginTop: 24 }}>
        {[0, 1, 2, 3].map((index) => <div key={index} className="skeleton" style={{ height: 150, borderRadius: 14 }} />)}
      </div>
    </div>
  );
}

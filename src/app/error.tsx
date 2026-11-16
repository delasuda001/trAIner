"use client";

export default function ErrorPage({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="card state" style={{ marginTop: 32 }}>
      <h2>Quelque chose a coincé</h2>
      <p>{error.message || "Erreur inattendue."}</p>
      <button type="button" className="btn" onClick={reset}>Réessayer</button>
    </div>
  );
}

import Link from "next/link";

export default function NotFound() {
  return (
    <div className="card state" style={{ marginTop: 32 }}>
      <h2>Séance introuvable</h2>
      <p>Elle a peut-être été supprimée de Garmin Connect.</p>
      <Link className="btn" href="/">Retour au tableau de bord</Link>
    </div>
  );
}

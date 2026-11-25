import { Eye } from "lucide-react";

/** Bandeau du « voir comme » : toujours visible, retour en un toucher. */
export function ViewAsBanner({ name }: { name: string }) {
  return (
    <div className="view-as-banner" role="note">
      <Eye size={14} aria-hidden />
      <span>Tu vois Sillage comme <strong>{name}</strong> · lecture seule</span>
      <a href="/api/view-as" className="view-as-back">Revenir à mon compte</a>
    </div>
  );
}

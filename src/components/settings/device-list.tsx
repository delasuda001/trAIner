import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

const VISIBLE = 3;

/** Liste d'appareils : les plus récents d'abord visibles, le reste replié pour ne pas noyer la page. */
export function DeviceList({ items }: { items: { key: string; node: ReactNode }[] }) {
  const shown = items.slice(0, VISIBLE);
  const rest = items.slice(VISIBLE);
  return (
    <>
      <ul className="device-list">
        {shown.map((item) => <li key={item.key}>{item.node}</li>)}
      </ul>
      {rest.length ? (
        <details className="more device-more">
          <summary><ChevronRight className="chev" size={14} /> {rest.length} autre{rest.length > 1 ? "s" : ""} appareil{rest.length > 1 ? "s" : ""}</summary>
          <ul className="device-list more-body">
            {rest.map((item) => <li key={item.key}>{item.node}</li>)}
          </ul>
        </details>
      ) : null}
    </>
  );
}

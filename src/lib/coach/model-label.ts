/** « claude-sonnet-5-5 » → « Claude Sonnet 5.5 » (affichage seulement). */
export function modelLabel(model: string): string {
  const match = /claude-(opus|sonnet|haiku|fable)-(\d+)(?:-(\d+))?/i.exec(model);
  if (!match) return model;
  const family = match[1].charAt(0).toUpperCase() + match[1].slice(1);
  return `Claude ${family} ${match[2]}${match[3] ? `.${match[3]}` : ""}`;
}

/** « 15 nov., 4 h 09 » */
export function generatedAtLabel(iso: string): string {
  const date = new Date(iso);
  const day = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" }).format(date);
  const time = new Intl.DateTimeFormat("fr-FR", { hour: "numeric", minute: "2-digit" }).format(date).replace(":", " h ");
  return `${day}, ${time}`;
}

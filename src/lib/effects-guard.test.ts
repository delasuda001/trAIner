import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/** Fichiers .tsx du dossier, récursivement. */
function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? sources(path) : path.endsWith(".tsx") ? [path] : [];
  });
}

describe("effets React", () => {
  it("aucun useEffect à corps concis : sa valeur deviendrait la fonction de nettoyage (bug du chat coach)", () => {
    const offenders = sources(join(__dirname, "..")).flatMap((file) =>
      readFileSync(file, "utf8").split("\n").flatMap((line, index) => (/use(Layout)?Effect\(\(\) => [^{\s]/.test(line) ? [`${file}:${index + 1}`] : [])),
    );
    expect(offenders).toEqual([]);
  });
});

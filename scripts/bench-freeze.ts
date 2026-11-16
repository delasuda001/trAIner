/**
 * Fige le jeu de séances du banc dans data/bench/fixtures.json (aucun appel à Claude).
 * Usage : npx tsx --conditions=react-server scripts/bench-freeze.ts
 */
import { freezeFixtures } from "@/lib/bench/freeze";
import { saveFixtures } from "@/lib/bench/store";

const fixtures = freezeFixtures();
saveFixtures(fixtures);
for (const fixture of fixtures) console.log(`${fixture.category.padEnd(18)} ${fixture.label}`);
console.log(`${fixtures.length} séances figées.`);

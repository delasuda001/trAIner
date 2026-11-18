import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { hasTutoiement, registerForRole, say, voiceDeep, vouvoyer } from "./register";

describe("vouvoyer", () => {
  it("convertit possessifs, pronoms et impératifs en tête de proposition", () => {
    expect(vouvoyer("Ta charge des 7 derniers jours vaut 1,6 fois ta moyenne : on absorbe avec une séance facile.")).toBe("Votre charge des 7 derniers jours vaut 1,6 fois votre moyenne : on absorbe avec une séance facile.");
    expect(vouvoyer("Course dans 6 semaines : garde le cap.")).toBe("Course dans 6 semaines : gardez le cap.");
    expect(vouvoyer("Allure : reste dans 4:05–4:10/km ; 3:58/km t'a fait travailler au-dessus de l'intensité visée.")).toBe("Allure : restez dans 4:05–4:10/km ; 3:58/km vous a fait travailler au-dessus de l'intensité visée.");
    expect(vouvoyer("En continu, en aisance respiratoire : tu dois pouvoir parler en phrases complètes.")).toBe("En continu, en aisance respiratoire : vous devez pouvoir parler en phrases complètes.");
    expect(vouvoyer("Durée normale pour toi.")).toBe("Durée normale pour vous.");
    expect(vouvoyer("Dans tes repères")).toBe("Dans vos repères");
    expect(vouvoyer("Intensité : 28 % du temps au-dessus de 149 bpm (haut de Z2) ; ralentis dès que tu le dépasses, quitte à courir à 7:05/km.")).toBe("Intensité : 28 % du temps au-dessus de 149 bpm (haut de Z2) ; ralentissez dès que vous le dépassez, quitte à courir à 7:05/km.");
    expect(vouvoyer("Si les signaux restent dégradés le jour J (VFC sous ta plage habituelle), remplace par ce footing facile.")).toBe("Si les signaux restent dégradés le jour J (VFC sous votre plage habituelle), remplacez par ce footing facile.");
  });

  it("laisse intacts les verbes à la 3e personne et les mots qui contiennent les pronoms", () => {
    const text = "La suivante reste facile pour que le travail paie ; on garde le rythme. Tableau, tempo, total, tonus, Toronto.";
    expect(vouvoyer(text)).toBe(text);
  });

  it("ne laisse aucun tutoiement dans les phrases du moteur", () => {
    const files = ["explain", "suggestion", "verdict", "prescription", "dynamics-reading", "load", "progression", "recovery"];
    const leftovers: string[] = [];
    for (const file of files) {
      const source = readFileSync(join(__dirname, "engine", `${file}.ts`), "utf8");
      const literals = [...source.matchAll(/"([^"\n]{4,})"|`([^`]{4,})`/g)].map((match) => match[1] ?? match[2]);
      for (const literal of literals) {
        // Morceaux de texte d'un gabarit (hors expressions ${…}).
        for (const chunk of literal.split(/\$\{[^}]*\}/)) {
          if (hasTutoiement(vouvoyer(chunk))) leftovers.push(`${file}: ${chunk}`);
        }
      }
    }
    expect(leftovers).toEqual([]);
  });

  it("voiceDeep ne touche rien pour Bastien et convertit chaque chaîne pour un invité", () => {
    const value = { reason: "Ta dernière course date de 9 jours.", nested: [{ text: "garde la prochaine séance facile" }], count: 3 };
    expect(voiceDeep(value, "tu")).toBe(value);
    expect(voiceDeep(value, "vous")).toEqual({ reason: "Votre dernière course date de 9 jours.", nested: [{ text: "gardez la prochaine séance facile" }], count: 3 });
  });

  it("registre : tu pour l'administrateur, vous pour un invité ou sans profil", () => {
    expect(registerForRole("admin")).toBe("tu");
    expect(registerForRole("guest")).toBe("vous");
    expect(registerForRole(null)).toBe("vous");
    expect(say("vous", "Tu peux", "Vous pouvez")).toBe("Vous pouvez");
  });
});

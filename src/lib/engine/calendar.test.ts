import { describe, expect, it } from "vitest";
import { calendarZone, trainingCalendar, type CalendarInput } from "./calendar";

const today = "2026-11-18"; // mercredi
const run = (id: string, date: string, distanceM = 8000): CalendarInput["activities"][number] => ({ id, date, run: true, zone: 2, family: "easy", title: "Endurance", distanceM });

describe("trainingCalendar", () => {
  it("découpe en semaines lundi → dimanche, la dernière étant la semaine en cours", () => {
    const calendar = trainingCalendar({ today, weeks: 8, target: 3, activities: [], planned: [] });
    expect(calendar.weeks).toHaveLength(8);
    expect(calendar.weeks[7].start).toBe("2026-11-16");
    expect(calendar.weeks[7].current).toBe(true);
    expect(calendar.weeks[0].start).toBe("2026-09-28");
    const days = calendar.weeks[7].days;
    expect(days[2].isToday).toBe(true);
    expect(days[3].isFuture).toBe(true);
    expect(days[1].isFuture).toBe(false);
  });

  it("ne compte que les courses, et ne juge pas la semaine en cours", () => {
    const calendar = trainingCalendar({
      today,
      weeks: 3,
      target: 3,
      activities: [
        run("a", "2026-11-03"), run("b", "2026-11-05"), run("c", "2026-11-08", 15000),
        run("d", "2026-11-11"), { id: "e", date: "2026-11-12", run: false, zone: null, family: "other", title: "Vélo", distanceM: 30000 },
        run("f", "2026-11-17"),
      ],
      planned: [{ date: "2026-11-20", type: "threshold", alternative: false }],
    });
    expect(calendar.weeks.map((week) => week.runs)).toEqual([3, 1, 1]);
    expect(calendar.weeks[0].runKm).toBe(31);
    expect(calendar.completedWeeks).toBe(2);
    expect(calendar.averageRunsPerWeek).toBe(2);
    expect(calendar.weeksAtTarget).toBe(1);
    expect(calendar.weeks[2].days[4].planned?.type).toBe("threshold");
  });

  it("sans cible : aucune semaine jugée", () => {
    const calendar = trainingCalendar({ today, weeks: 2, target: null, activities: [run("a", "2026-11-10")], planned: [] });
    expect(calendar.weeksAtTarget).toBe(0);
    expect(calendar.averageRunsPerWeek).toBe(1);
  });
});

describe("couleur d'une séance dans le calendrier", () => {
  it("un fractionné prend la zone de son travail, pas sa zone dominante (échauffement, récupérations)", () => {
    expect(calendarZone("intervals_tempo", [0.13, 0.41, 0.2, 0.26, 0])).toBe(3);
    expect(calendarZone("intervals_vo2", [0.2, 0.5, 0.1, 0.1, 0.1])).toBe(5);
    expect(calendarZone("threshold", null)).toBe(4);
  });

  it("une sortie facile garde sa zone dominante ; sans données, pas de zone", () => {
    expect(calendarZone("endurance", [0.11, 0.6, 0.25, 0.04, 0])).toBe(2);
    expect(calendarZone(null, null)).toBeNull();
  });
});

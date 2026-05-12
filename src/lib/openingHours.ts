import { parseISO } from "date-fns";
import type { Spot, OpeningHours } from "@/types";

export function isOutsideHours(spot: Spot, dayDate: string): boolean {
  if (!spot.openingHours || !spot.startTime) return false;

  const dayOfWeek = parseISO(dayDate).getDay(); // 0=Sun..6=Sat
  const [h, m] = spot.startTime.split(":").map(Number);
  const startMin = h * 60 + m;

  const todayPeriods = spot.openingHours.periods.filter(
    (p) => p.open.day === dayOfWeek
  );
  if (todayPeriods.length === 0) return true; // Closed this day

  return !todayPeriods.some((p) => {
    const openH = parseInt(p.open.time.slice(0, 2), 10);
    const openM = parseInt(p.open.time.slice(2), 10);
    const openMin = openH * 60 + openM;
    const closeMin = p.close
      ? parseInt(p.close.time.slice(0, 2), 10) * 60 + parseInt(p.close.time.slice(2), 10)
      : 24 * 60;
    return startMin >= openMin && startMin < closeMin;
  });
}

// New Places API: google.maps.places.Place.regularOpeningHours
export function extractOpeningHoursFromPlace(
  oh: google.maps.places.OpeningHours
): OpeningHours {
  const periods = oh.periods.map((p) => ({
    open: {
      day: p.open.day,
      time:
        String(p.open.hour).padStart(2, "0") +
        String(p.open.minute).padStart(2, "0"),
    },
    ...(p.close
      ? {
          close: {
            day: p.close.day,
            time:
              String(p.close.hour).padStart(2, "0") +
              String(p.close.minute).padStart(2, "0"),
          },
        }
      : {}),
  }));

  return {
    periods,
    weekdayText: oh.weekdayDescriptions,
  };
}

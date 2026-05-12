import { format, parseISO } from "date-fns";
import { ja } from "date-fns/locale";
import type { Trip } from "@/types";

export function formatDate(dateStr: string): string {
  return format(parseISO(dateStr), "M月d日(E)", { locale: ja });
}

export function formatDateShort(dateStr: string): string {
  return format(parseISO(dateStr), "M/d", { locale: ja });
}

export function tripDuration(trip: Trip): number {
  return trip.days.length;
}

export function encodeShareData(trip: Trip): string {
  const json = JSON.stringify(trip);
  return btoa(encodeURIComponent(json));
}

export function decodeShareData(encoded: string): Trip | null {
  try {
    const json = decodeURIComponent(atob(encoded));
    return JSON.parse(json) as Trip;
  } catch {
    return null;
  }
}

export const SPOT_COLORS = [
  "#EF4444", // red
  "#F97316", // orange
  "#EAB308", // yellow
  "#22C55E", // green
  "#3B82F6", // blue
  "#8B5CF6", // purple
  "#EC4899", // pink
];

export function getDayColor(index: number): string {
  return SPOT_COLORS[index % SPOT_COLORS.length];
}

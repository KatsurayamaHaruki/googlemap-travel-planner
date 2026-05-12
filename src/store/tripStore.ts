import { create } from "zustand";
import { v4 as uuidv4 } from "uuid";
import { addDays, format, parseISO, differenceInDays } from "date-fns";
import type { Trip, Day, Spot, CandidateSpot } from "@/types";
import { createClient } from "@/lib/supabase";

function buildDays(startDate: string, endDate: string): Day[] {
  const start = parseISO(startDate);
  const end = parseISO(endDate);
  const count = differenceInDays(end, start) + 1;
  return Array.from({ length: count }, (_, i) => ({
    id: uuidv4(),
    date: format(addDays(start, i), "yyyy-MM-dd"),
    spots: [],
  }));
}

async function syncTrip(trip: Trip) {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    console.warn("[syncTrip] no session — trip not saved:", trip.id);
    return;
  }
  const { error } = await supabase.from("trips").upsert({
    id: trip.id,
    user_id: session.user.id,
    data: trip,
    updated_at: new Date().toISOString(),
  });
  if (error) console.error("[syncTrip] upsert failed:", error.message, error.details ?? "");
  else console.log("[syncTrip] saved:", trip.id);
}

async function removeFromDb(tripId: string) {
  const supabase = createClient();
  const { error } = await supabase.from("trips").delete().eq("id", tripId);
  if (error) console.error("[removeFromDb] delete failed:", error.message);
}

interface TripStore {
  trips: Trip[];
  loading: boolean;
  loadTrips: () => Promise<void>;
  createTrip: (data: { title: string; destination: string; startDate: string; endDate: string }) => Trip;
  updateTrip: (id: string, data: Partial<Pick<Trip, "title" | "destination">>) => void;
  deleteTrip: (id: string) => void;
  addSpot: (tripId: string, dayId: string, spot: Omit<Spot, "id" | "order">) => void;
  updateSpot: (tripId: string, dayId: string, spotId: string, data: Partial<Spot>) => void;
  removeSpot: (tripId: string, dayId: string, spotId: string) => void;
  reorderSpots: (tripId: string, dayId: string, spots: Spot[]) => void;
  moveSpot: (tripId: string, fromDayId: string, toDayId: string, spotId: string, toIndex: number) => void;
  addCandidate: (tripId: string, spot: Omit<CandidateSpot, "id">) => void;
  removeCandidate: (tripId: string, candidateId: string) => void;
  promoteCandidate: (tripId: string, dayId: string, candidateId: string) => void;
}

export const useTripStore = create<TripStore>()((set, get) => ({
  trips: [],
  loading: true,

  loadTrips: async () => {
    set({ loading: true });
    const supabase = createClient();
    const { data, error } = await supabase
      .from("trips")
      .select("data")
      .order("updated_at", { ascending: false });
    if (error) {
      console.error("[loadTrips] fetch failed:", error.message, error.details ?? "", error.hint ?? "");
    } else if (data) {
      set({ trips: data.map((row) => {
        const trip = row.data as Trip;
        // Back-compat: older saved trips may not have candidates
        return { ...trip, candidates: trip.candidates ?? [] };
      }) });
    }
    set({ loading: false });
  },

  createTrip: (data) => {
    const trip: Trip = {
      id: uuidv4(),
      ...data,
      days: buildDays(data.startDate, data.endDate),
      candidates: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    set((state) => ({ trips: [...state.trips, trip] }));
    syncTrip(trip);
    return trip;
  },

  updateTrip: (id, data) => {
    set((state) => ({
      trips: state.trips.map((t) =>
        t.id === id ? { ...t, ...data, updatedAt: new Date().toISOString() } : t
      ),
    }));
    const trip = get().trips.find((t) => t.id === id);
    if (trip) syncTrip(trip);
  },

  deleteTrip: (id) => {
    set((state) => ({ trips: state.trips.filter((t) => t.id !== id) }));
    removeFromDb(id);
  },

  addSpot: (tripId, dayId, spotData) => {
    set((state) => ({
      trips: state.trips.map((trip) => {
        if (trip.id !== tripId) return trip;
        return {
          ...trip,
          updatedAt: new Date().toISOString(),
          days: trip.days.map((day) => {
            if (day.id !== dayId) return day;
            const newSpot: Spot = { id: uuidv4(), ...spotData, order: day.spots.length };
            return { ...day, spots: [...day.spots, newSpot] };
          }),
        };
      }),
    }));
    const trip = get().trips.find((t) => t.id === tripId);
    if (trip) syncTrip(trip);
  },

  updateSpot: (tripId, dayId, spotId, data) => {
    set((state) => ({
      trips: state.trips.map((trip) => {
        if (trip.id !== tripId) return trip;
        return {
          ...trip,
          updatedAt: new Date().toISOString(),
          days: trip.days.map((day) => {
            if (day.id !== dayId) return day;
            return { ...day, spots: day.spots.map((s) => (s.id === spotId ? { ...s, ...data } : s)) };
          }),
        };
      }),
    }));
    const trip = get().trips.find((t) => t.id === tripId);
    if (trip) syncTrip(trip);
  },

  removeSpot: (tripId, dayId, spotId) => {
    set((state) => ({
      trips: state.trips.map((trip) => {
        if (trip.id !== tripId) return trip;
        return {
          ...trip,
          updatedAt: new Date().toISOString(),
          days: trip.days.map((day) => {
            if (day.id !== dayId) return day;
            return {
              ...day,
              spots: day.spots.filter((s) => s.id !== spotId).map((s, i) => ({ ...s, order: i })),
            };
          }),
        };
      }),
    }));
    const trip = get().trips.find((t) => t.id === tripId);
    if (trip) syncTrip(trip);
  },

  reorderSpots: (tripId, dayId, spots) => {
    set((state) => ({
      trips: state.trips.map((trip) => {
        if (trip.id !== tripId) return trip;
        return {
          ...trip,
          updatedAt: new Date().toISOString(),
          days: trip.days.map((day) => {
            if (day.id !== dayId) return day;
            return { ...day, spots: spots.map((s, i) => ({ ...s, order: i })) };
          }),
        };
      }),
    }));
    const trip = get().trips.find((t) => t.id === tripId);
    if (trip) syncTrip(trip);
  },

  moveSpot: (tripId, fromDayId, toDayId, spotId, toIndex) => {
    set((state) => ({
      trips: state.trips.map((trip) => {
        if (trip.id !== tripId) return trip;
        const fromDay = trip.days.find((d) => d.id === fromDayId);
        const spot = fromDay?.spots.find((s) => s.id === spotId);
        if (!spot) return trip;
        return {
          ...trip,
          updatedAt: new Date().toISOString(),
          days: trip.days.map((day) => {
            if (day.id === fromDayId) {
              return {
                ...day,
                spots: day.spots.filter((s) => s.id !== spotId).map((s, i) => ({ ...s, order: i })),
              };
            }
            if (day.id === toDayId) {
              const newSpots = [...day.spots];
              newSpots.splice(toIndex, 0, spot);
              return { ...day, spots: newSpots.map((s, i) => ({ ...s, order: i })) };
            }
            return day;
          }),
        };
      }),
    }));
    const trip = get().trips.find((t) => t.id === tripId);
    if (trip) syncTrip(trip);
  },

  addCandidate: (tripId, spotData) => {
    set((state) => ({
      trips: state.trips.map((trip) => {
        if (trip.id !== tripId) return trip;
        const newCandidate: CandidateSpot = { id: uuidv4(), ...spotData };
        return {
          ...trip,
          updatedAt: new Date().toISOString(),
          candidates: [...(trip.candidates ?? []), newCandidate],
        };
      }),
    }));
    const trip = get().trips.find((t) => t.id === tripId);
    if (trip) syncTrip(trip);
  },

  removeCandidate: (tripId, candidateId) => {
    set((state) => ({
      trips: state.trips.map((trip) => {
        if (trip.id !== tripId) return trip;
        return {
          ...trip,
          updatedAt: new Date().toISOString(),
          candidates: (trip.candidates ?? []).filter((c) => c.id !== candidateId),
        };
      }),
    }));
    const trip = get().trips.find((t) => t.id === tripId);
    if (trip) syncTrip(trip);
  },

  promoteCandidate: (tripId, dayId, candidateId) => {
    set((state) => ({
      trips: state.trips.map((trip) => {
        if (trip.id !== tripId) return trip;
        const candidate = (trip.candidates ?? []).find((c) => c.id === candidateId);
        if (!candidate) return trip;
        return {
          ...trip,
          updatedAt: new Date().toISOString(),
          candidates: (trip.candidates ?? []).filter((c) => c.id !== candidateId),
          days: trip.days.map((day) => {
            if (day.id !== dayId) return day;
            const newSpot: Spot = {
              id: uuidv4(),
              name: candidate.name,
              lat: candidate.lat,
              lng: candidate.lng,
              address: candidate.address,
              placeId: candidate.placeId,
              website: candidate.website,
              memo: candidate.memo,
              photos: candidate.photos,
              openingHours: candidate.openingHours,
              order: day.spots.length,
            };
            return { ...day, spots: [...day.spots, newSpot] };
          }),
        };
      }),
    }));
    const trip = get().trips.find((t) => t.id === tripId);
    if (trip) syncTrip(trip);
  },
}));

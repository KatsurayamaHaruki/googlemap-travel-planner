import { create } from "zustand";
import { v4 as uuidv4 } from "uuid";
import { addDays, format, parseISO, differenceInDays } from "date-fns";
import type { Trip, Day, Spot, CandidateSpot, TripRole, SavedRoute } from "@/types";
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

/** roleはDBに保存しない */
function stripRole(trip: Trip): Omit<Trip, "role"> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { role: _role, ...rest } = trip;
  return rest;
}

async function syncTrip(trip: Trip, isNew = false): Promise<string | null> {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    console.warn("[syncTrip] no session — trip not saved:", trip.id);
    return "ログインセッションが切れています。再ログインしてください。";
  }
  const tripData = stripRole(trip);
  const now = new Date().toISOString();

  if (isNew) {
    const { error } = await supabase.from("trips").insert({
      id: trip.id,
      user_id: session.user.id,
      data: tripData,
      updated_at: now,
    });
    if (error) {
      console.error("[syncTrip] insert failed:", error.message);
      return `保存に失敗しました: ${error.message}`;
    }
  } else {
    const { error } = await supabase
      .from("trips")
      .update({ data: tripData, updated_at: now })
      .eq("id", trip.id);
    if (error) {
      console.error("[syncTrip] update failed:", error.message);
      return `保存に失敗しました: ${error.message}`;
    }
  }
  return null;
}

async function removeFromDb(tripId: string) {
  const supabase = createClient();
  const { error } = await supabase.from("trips").delete().eq("id", tripId);
  if (error) console.error("[removeFromDb] delete failed:", error.message);
}

async function leaveFromDb(tripId: string) {
  const supabase = createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return;
  const { error } = await supabase
    .from("trip_members")
    .delete()
    .eq("trip_id", tripId)
    .eq("user_id", session.user.id);
  if (error) console.error("[leaveFromDb] delete failed:", error.message);
}

interface TripStore {
  trips: Trip[];
  loading: boolean;
  syncError: string | null;
  clearSyncError: () => void;
  loadTrips: () => Promise<void>;
  createTrip: (data: { title: string; destination: string; startDate: string; endDate: string }) => Trip;
  updateTrip: (id: string, data: Partial<Pick<Trip, "title" | "destination">>) => void;
  deleteTrip: (id: string) => void;
  leaveTrip: (id: string) => void;
  addSpot: (tripId: string, dayId: string, spot: Omit<Spot, "id" | "order">) => void;
  updateSpot: (tripId: string, dayId: string, spotId: string, data: Partial<Spot>) => void;
  removeSpot: (tripId: string, dayId: string, spotId: string) => void;
  reorderSpots: (tripId: string, dayId: string, spots: Spot[]) => void;
  moveSpot: (tripId: string, fromDayId: string, toDayId: string, spotId: string, toIndex: number) => void;
  addCandidate: (tripId: string, spot: Omit<CandidateSpot, "id">) => void;
  removeCandidate: (tripId: string, candidateId: string) => void;
  promoteCandidate: (tripId: string, dayId: string, candidateId: string) => void;
  updateDayRoute: (tripId: string, dayId: string, key: string, route: SavedRoute | null) => void;
}

export const useTripStore = create<TripStore>()((set, get) => ({
  trips: [],
  loading: true,
  syncError: null,
  clearSyncError: () => set({ syncError: null }),

  loadTrips: async () => {
    set({ loading: true });
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { set({ loading: false }); return; }

    const [tripsResult, membershipsResult] = await Promise.all([
      supabase
        .from("trips")
        .select("id, data, user_id")
        .order("updated_at", { ascending: false }),
      supabase
        .from("trip_members")
        .select("trip_id, role")
        .eq("user_id", session.user.id),
    ]);

    if (tripsResult.error) {
      console.error("[loadTrips] fetch failed:", tripsResult.error.message);
    } else if (tripsResult.data) {
      const membershipMap = new Map<string, Exclude<TripRole, "owner">>(
        (membershipsResult.data ?? []).map((m) => [m.trip_id, m.role as Exclude<TripRole, "owner">])
      );
      set({
        trips: tripsResult.data.map((row) => {
          const trip = row.data as Trip;
          const isOwner = row.user_id === session.user.id;
          const memberRole = membershipMap.get(row.id as string);
          const role: TripRole = isOwner ? "owner" : (memberRole ?? "viewer");
          return { ...trip, candidates: trip.candidates ?? [], role };
        }),
      });
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
      role: "owner",
    };
    set((state) => ({ trips: [...state.trips, trip] }));
    syncTrip(trip, true).then((err) => { if (err) set({ syncError: err }); });
    return trip;
  },

  updateTrip: (id, data) => {
    let updated: Trip | undefined;
    set((state) => ({
      trips: state.trips.map((t) => {
        if (t.id !== id) return t;
        updated = { ...t, ...data, updatedAt: new Date().toISOString() };
        return updated;
      }),
    }));
    if (updated) syncTrip(updated).then((err) => { if (err) set({ syncError: err }); });
  },

  deleteTrip: (id) => {
    set((state) => ({ trips: state.trips.filter((t) => t.id !== id) }));
    removeFromDb(id);
  },

  leaveTrip: (id) => {
    set((state) => ({ trips: state.trips.filter((t) => t.id !== id) }));
    leaveFromDb(id);
  },

  addSpot: (tripId, dayId, spotData) => {
    let updated: Trip | undefined;
    set((state) => ({
      trips: state.trips.map((trip) => {
        if (trip.id !== tripId) return trip;
        updated = {
          ...trip,
          updatedAt: new Date().toISOString(),
          days: trip.days.map((day) => {
            if (day.id !== dayId) return day;
            const newSpot: Spot = { id: uuidv4(), ...spotData, order: day.spots.length };
            return { ...day, spots: [...day.spots, newSpot] };
          }),
        };
        return updated;
      }),
    }));
    if (updated) syncTrip(updated).then((err) => { if (err) set({ syncError: err }); });
  },

  updateSpot: (tripId, dayId, spotId, data) => {
    let updated: Trip | undefined;
    set((state) => ({
      trips: state.trips.map((trip) => {
        if (trip.id !== tripId) return trip;
        updated = {
          ...trip,
          updatedAt: new Date().toISOString(),
          days: trip.days.map((day) => {
            if (day.id !== dayId) return day;
            return { ...day, spots: day.spots.map((s) => (s.id === spotId ? { ...s, ...data } : s)) };
          }),
        };
        return updated;
      }),
    }));
    if (updated) syncTrip(updated).then((err) => { if (err) set({ syncError: err }); });
  },

  removeSpot: (tripId, dayId, spotId) => {
    let updated: Trip | undefined;
    set((state) => ({
      trips: state.trips.map((trip) => {
        if (trip.id !== tripId) return trip;
        updated = {
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
        return updated;
      }),
    }));
    if (updated) syncTrip(updated).then((err) => { if (err) set({ syncError: err }); });
  },

  reorderSpots: (tripId, dayId, spots) => {
    let updated: Trip | undefined;
    set((state) => ({
      trips: state.trips.map((trip) => {
        if (trip.id !== tripId) return trip;
        updated = {
          ...trip,
          updatedAt: new Date().toISOString(),
          days: trip.days.map((day) => {
            if (day.id !== dayId) return day;
            return { ...day, spots: spots.map((s, i) => ({ ...s, order: i })) };
          }),
        };
        return updated;
      }),
    }));
    if (updated) syncTrip(updated).then((err) => { if (err) set({ syncError: err }); });
  },

  moveSpot: (tripId, fromDayId, toDayId, spotId, toIndex) => {
    let updated: Trip | undefined;
    set((state) => ({
      trips: state.trips.map((trip) => {
        if (trip.id !== tripId) return trip;
        const fromDay = trip.days.find((d) => d.id === fromDayId);
        const spot = fromDay?.spots.find((s) => s.id === spotId);
        if (!spot) return trip;
        updated = {
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
        return updated;
      }),
    }));
    if (updated) syncTrip(updated).then((err) => { if (err) set({ syncError: err }); });
  },

  addCandidate: (tripId, spotData) => {
    let updated: Trip | undefined;
    set((state) => ({
      trips: state.trips.map((trip) => {
        if (trip.id !== tripId) return trip;
        const newCandidate: CandidateSpot = { id: uuidv4(), ...spotData };
        updated = {
          ...trip,
          updatedAt: new Date().toISOString(),
          candidates: [...(trip.candidates ?? []), newCandidate],
        };
        return updated;
      }),
    }));
    if (updated) syncTrip(updated).then((err) => { if (err) set({ syncError: err }); });
  },

  removeCandidate: (tripId, candidateId) => {
    let updated: Trip | undefined;
    set((state) => ({
      trips: state.trips.map((trip) => {
        if (trip.id !== tripId) return trip;
        updated = {
          ...trip,
          updatedAt: new Date().toISOString(),
          candidates: (trip.candidates ?? []).filter((c) => c.id !== candidateId),
        };
        return updated;
      }),
    }));
    if (updated) syncTrip(updated).then((err) => { if (err) set({ syncError: err }); });
  },

  promoteCandidate: (tripId, dayId, candidateId) => {
    let updated: Trip | undefined;
    set((state) => ({
      trips: state.trips.map((trip) => {
        if (trip.id !== tripId) return trip;
        const candidate = (trip.candidates ?? []).find((c) => c.id === candidateId);
        if (!candidate) return trip;
        updated = {
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
        return updated;
      }),
    }));
    if (updated) syncTrip(updated).then((err) => { if (err) set({ syncError: err }); });
  },

  updateDayRoute: (tripId, dayId, key, route) => {
    let updated: Trip | undefined;
    set((state) => ({
      trips: state.trips.map((trip) => {
        if (trip.id !== tripId) return trip;
        updated = {
          ...trip,
          updatedAt: new Date().toISOString(),
          days: trip.days.map((day) => {
            if (day.id !== dayId) return day;
            const routes = { ...(day.routes ?? {}) };
            if (route === null) {
              delete routes[key];
            } else {
              routes[key] = route;
            }
            return { ...day, routes };
          }),
        };
        return updated;
      }),
    }));
    if (updated) syncTrip(updated).then((err) => { if (err) set({ syncError: err }); });
  },
}));

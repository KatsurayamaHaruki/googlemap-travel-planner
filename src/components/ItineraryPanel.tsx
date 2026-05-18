"use client";
import { useState, useRef, useEffect, useCallback } from "react";
import { Plus, GripVertical, Clock, ChevronDown, ChevronUp, AlertTriangle, Train, Car, Footprints, Navigation, X } from "lucide-react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { useDroppable } from "@dnd-kit/core";
import { useMapsLibrary } from "@vis.gl/react-google-maps";
import { CSS } from "@dnd-kit/utilities";
import type { Day, Spot, Trip, TravelMode, SavedRoute } from "@/types";
import { formatDate, getDayColor } from "@/lib/utils";
import { isOutsideHours } from "@/lib/openingHours";
import type { RouteLeg, TransitStep } from "@/hooks/useDirections";

// ---------------------------------------------------------------------------
// Route fetch helpers (duplicated from useDirections to avoid hook constraints)
// ---------------------------------------------------------------------------
function parseDurationStr(s: string): number { return parseFloat(s) * 1000; }
function fmtMs(ms: number): string {
  const m = Math.round(ms / 60000);
  if (m < 60) return `${m}分`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r > 0 ? `${h}時間${r}分` : `${h}時間`;
}
function fmtDist(meters: number): string {
  return meters < 1000 ? `${meters}m` : `${(meters / 1000).toFixed(1)}km`;
}
function fmtTime(date: Date): string {
  return date.toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit", hour12: false });
}
function decodePolyline(encoded: string): google.maps.LatLng[] {
  const pts: google.maps.LatLng[] = [];
  let i = 0, lat = 0, lng = 0;
  while (i < encoded.length) {
    let r = 0, s = 0, b: number;
    do { b = encoded.charCodeAt(i++) - 63; r |= (b & 0x1f) << s; s += 5; } while (b >= 0x20);
    lat += (r & 1) ? ~(r >> 1) : r >> 1;
    r = 0; s = 0;
    do { b = encoded.charCodeAt(i++) - 63; r |= (b & 0x1f) << s; s += 5; } while (b >= 0x20);
    lng += (r & 1) ? ~(r >> 1) : r >> 1;
    pts.push(new google.maps.LatLng(lat / 1e5, lng / 1e5));
  }
  return pts;
}

// ---------------------------------------------------------------------------
// LegConnector — click to choose travel mode and fetch a single route leg
// ---------------------------------------------------------------------------
interface LegConnectorProps {
  fromSpot: Spot;
  toSpot: Spot;
  dayDate: string;
  savedRoute?: SavedRoute | null;
  onLegChange: (leg: RouteLeg | null) => void;
  onRouteSave: (route: SavedRoute | null) => void;
}

function vehicleIcon(type?: string) {
  if (!type) return "🚌";
  const t = type.toUpperCase();
  if (t.includes("SUBWAY") || t.includes("HEAVY_RAIL") || t.includes("COMMUTER_TRAIN") || t.includes("RAIL")) return "🚆";
  if (t.includes("BUS")) return "🚌";
  if (t.includes("TRAM")) return "🚃";
  return "🚌";
}

function LegConnector({ fromSpot, toSpot, dayDate, savedRoute, onLegChange, onRouteSave }: LegConnectorProps) {
  const routesLib = useMapsLibrary("routes");
  const [open, setOpen] = useState(() => savedRoute != null);
  const [mode, setMode] = useState<TravelMode | null>(() => savedRoute?.mode ?? null);
  const [leg, setLeg] = useState<RouteLeg | null>(null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [transitFallback, setTransitFallback] = useState(() => savedRoute?.transitFallback ?? false);
  const restoredRef = useRef(false);
  const onLegChangeRef = useRef(onLegChange);
  onLegChangeRef.current = onLegChange;

  // savedRoute からの復元（routesLib が使える状態になってから overviewPath を再構築）
  useEffect(() => {
    if (restoredRef.current || !savedRoute) return;
    if (savedRoute.transitFallback) {
      restoredRef.current = true;
      return;
    }
    if (!routesLib) return;
    restoredRef.current = true;
    const overviewPath = savedRoute.overviewPath.map(
      ({ lat, lng }) => new google.maps.LatLng(lat, lng)
    );
    const restored: RouteLeg = {
      duration: savedRoute.duration,
      distance: savedRoute.distance,
      transitSteps: savedRoute.transitSteps,
      overviewPath,
    };
    setLeg(restored);
    onLegChangeRef.current(restored);
  }, [routesLib, savedRoute]);

  async function fetchRoute(selectedMode: TravelMode) {
    if (!routesLib) {
      setFetchError("地図ライブラリの読み込み中です。しばらくしてから再試行してください。");
      return;
    }
    setMode(selectedMode);
    setLoading(true);
    setLeg(null);
    setFetchError(null);
    setTransitFallback(false);
    onLegChange(null);

    try {
      let result: RouteLeg | null = null;

      if (selectedMode === "TRANSIT") {
        // Use DirectionsService (browser-side, respects referrer-restricted API keys)
        // Always use the next transit-safe time (weekday 10 AM JST) to avoid ZERO_RESULTS at night.
        // All arithmetic is UTC-based so it works correctly regardless of browser timezone.
        const departureTime = (() => {
          const JST_OFFSET = 9 * 3600_000;
          const nowUTC = Date.now();
          // Represent now in JST calendar via UTC components
          const nowJSTDate = new Date(nowUTC + JST_OFFSET);
          // 10 AM JST = 01:00 UTC of the same JST calendar day
          let target = new Date(Date.UTC(
            nowJSTDate.getUTCFullYear(),
            nowJSTDate.getUTCMonth(),
            nowJSTDate.getUTCDate(),
            1, 0, 0, 0,
          ));
          // If 10 AM JST today is already past, move to tomorrow
          if (target.getTime() <= nowUTC) target.setUTCDate(target.getUTCDate() + 1);
          // Skip Saturday(6) and Sunday(0) in JST
          while (true) {
            const jstDay = new Date(target.getTime() + JST_OFFSET).getUTCDay();
            if (jstDay !== 0 && jstDay !== 6) break;
            target.setUTCDate(target.getUTCDate() + 1);
          }
          return target;
        })();
        console.log("[fetchRoute] transit departure (JST):", new Date(departureTime.getTime() + 9 * 3600_000).toISOString());

        const svc = new google.maps.DirectionsService();
        const res = await svc.route({
          origin: { lat: fromSpot.lat, lng: fromSpot.lng },
          destination: { lat: toSpot.lat, lng: toSpot.lng },
          travelMode: google.maps.TravelMode.TRANSIT,
          transitOptions: { departureTime },
        });
        console.log("[fetchRoute] DirectionsService result:", res.routes?.length, "routes");
        const route0 = res.routes?.[0];
        const leg = route0?.legs?.[0];
        if (route0 && leg) {
          const polyline = route0.overview_polyline as unknown as string | { points: string };
          const encoded = typeof polyline === "string" ? polyline : polyline.points;
          const overviewPath = encoded ? decodePolyline(encoded) : [];

          const transitSteps: TransitStep[] = leg.steps
            .filter((s) => s.travel_mode === google.maps.TravelMode.TRANSIT)
            .map((s) => {
              const t = s.transit!;
              return {
                duration: s.duration?.value ? fmtMs(s.duration.value * 1000) : "",
                lineName: t.line?.name ?? undefined,
                lineShortName: t.line?.short_name ?? undefined,
                vehicleType: (t.line?.vehicle?.type as string | undefined) ?? undefined,
                departureStop: t.departure_stop?.name ?? undefined,
                arrivalStop: t.arrival_stop?.name ?? undefined,
                departureTime: t.departure_time?.text ?? undefined,
                arrivalTime: t.arrival_time?.text ?? undefined,
                numStops: t.num_stops ?? undefined,
              };
            });

          result = {
            duration: leg.duration?.value ? fmtMs(leg.duration.value * 1000) : "",
            distance: leg.distance?.value ? fmtDist(leg.distance.value) : "",
            transitSteps,
            overviewPath,
          };
        }
      } else {
        // Routes API v2 for DRIVING / WALKING
        const raw = await routesLib.Route.computeRoutes({
          origin: { lat: fromSpot.lat, lng: fromSpot.lng },
          destination: { lat: toSpot.lat, lng: toSpot.lng },
          travelMode: selectedMode as google.maps.TravelModeString,
          language: "ja",
          fields: ["durationMillis", "distanceMeters", "path"],
        });
        const route = raw.routes?.[0] as Record<string, unknown> | undefined;
        if (route) {
          const overviewPath = ((route.path ?? []) as { lat: number; lng: number }[])
            .map((p) => new google.maps.LatLng(p.lat, p.lng));
          result = {
            duration: (route.durationMillis as number | undefined) ? fmtMs(route.durationMillis as number) : "",
            distance: (route.distanceMeters as number | undefined) ? fmtDist(route.distanceMeters as number) : "",
            transitSteps: [],
            overviewPath,
          };
        }
      }

      if (!result) {
        if (selectedMode === "TRANSIT") {
          setTransitFallback(true);
          onRouteSave({
            mode: selectedMode,
            duration: "",
            distance: "",
            transitFallback: true,
            transitSteps: [],
            overviewPath: [],
          });
        } else {
          setFetchError("経路が見つかりませんでした");
        }
        return;
      }
      setLeg(result);
      onLegChange(result);
      onRouteSave({
        mode: selectedMode,
        duration: result.duration,
        distance: result.distance,
        transitFallback: false,
        transitSteps: result.transitSteps,
        overviewPath: result.overviewPath.map((p) => ({ lat: p.lat(), lng: p.lng() })),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (selectedMode === "TRANSIT") {
        console.warn("[LegConnector] transit unavailable via API, using Maps link:", msg);
        setTransitFallback(true);
        onRouteSave({
          mode: selectedMode,
          duration: "",
          distance: "",
          transitFallback: true,
          transitSteps: [],
          overviewPath: [],
        });
      } else {
        console.error("[LegConnector] fetchRoute error:", err);
        setFetchError(msg);
      }
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    setOpen(false);
    setMode(null);
    setLeg(null);
    setExpanded(false);
    setFetchError(null);
    setTransitFallback(false);
    restoredRef.current = false;
    onLegChange(null);
    onRouteSave(null);
  }

  const isNav = mode === "DRIVING" || mode === "WALKING";
  const ModeIcon = mode === "DRIVING" ? Car : mode === "WALKING" ? Footprints : Train;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="my-0.5 ml-5 flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-gray-300 hover:text-blue-400 hover:bg-blue-50 transition w-fit"
      >
        <span className="text-base leading-none">+</span>
        <span>経路を表示</span>
      </button>
    );
  }

  return (
    <div className="my-1 ml-5 rounded-xl border border-gray-100 bg-gray-50 p-2.5 text-xs">
      {/* Mode selector row */}
      <div className="flex items-center gap-1.5">
        {(["TRANSIT", "DRIVING", "WALKING"] as TravelMode[]).map((m) => {
          const Icon = m === "DRIVING" ? Car : m === "WALKING" ? Footprints : Train;
          const label = m === "TRANSIT" ? "電車" : m === "DRIVING" ? "車" : "徒歩";
          return (
            <button
              key={m}
              onClick={() => fetchRoute(m)}
              disabled={loading}
              className={`flex items-center gap-1 rounded-lg px-2 py-1 font-medium transition disabled:opacity-40 ${
                mode === m
                  ? "bg-blue-600 text-white"
                  : "bg-white text-gray-600 ring-1 ring-gray-200 hover:bg-gray-100"
              }`}
            >
              <Icon size={10} />
              {label}
            </button>
          );
        })}
        <button
          onClick={handleClose}
          className="ml-auto rounded-lg p-1 text-gray-300 hover:text-gray-500"
        >
          <X size={12} />
        </button>
      </div>

      {/* Loading */}
      {loading && (
        <div className="mt-2 flex items-center gap-2 text-gray-400">
          <div className="h-3 w-3 animate-spin rounded-full border-2 border-blue-400 border-t-transparent" />
          取得中...
        </div>
      )}

      {/* Error */}
      {!loading && fetchError && (
        <div className="mt-2 rounded-lg bg-red-50 px-2.5 py-1.5 text-xs text-red-600">
          ⚠ {fetchError}
        </div>
      )}

      {/* Transit fallback — API doesn't support TRANSIT in Japan; open Google Maps instead */}
      {!loading && transitFallback && (
        <div className="mt-2 space-y-1.5">
          <p className="text-xs text-gray-400">乗換案内はGoogleマップで確認できます</p>
          <a
            href={`https://www.google.com/maps/dir/?api=1&origin=${fromSpot.lat},${fromSpot.lng}&destination=${toSpot.lat},${toSpot.lng}&travelmode=transit`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 rounded-lg bg-blue-50 px-2.5 py-1.5 text-xs text-blue-600 hover:bg-blue-100 w-full"
          >
            <Navigation size={11} />
            Google マップで乗換案内を見る
          </a>
        </div>
      )}

      {/* Result */}
      {!loading && leg && mode && (
        <div className="mt-2">
          <button
            onClick={() => !isNav && setExpanded((v) => !v)}
            className="flex w-full items-center gap-2 text-left"
          >
            <ModeIcon size={12} className="shrink-0 text-gray-400" />
            <span className="flex-1 font-medium text-gray-700">
              {leg.duration}
              {leg.distance && <span className="ml-1 text-gray-400">({leg.distance})</span>}
            </span>
            {!isNav && leg.transitSteps.length > 0 && (
              expanded ? <ChevronUp size={10} className="text-gray-400" /> : <ChevronDown size={10} className="text-gray-400" />
            )}
          </button>

          {/* Nav link for DRIVING/WALKING */}
          {isNav && (
            <a
              href={`https://www.google.com/maps/dir/?api=1&origin=${fromSpot.lat},${fromSpot.lng}&destination=${toSpot.lat},${toSpot.lng}&travelmode=${mode === "DRIVING" ? "driving" : "walking"}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1.5 flex items-center gap-1.5 rounded-lg bg-blue-50 px-2.5 py-1.5 text-blue-600 hover:bg-blue-100 w-full"
            >
              <Navigation size={11} />
              Google Maps でナビ開始
            </a>
          )}

          {/* Transit summary chips */}
          {!isNav && !expanded && leg.transitSteps.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {leg.transitSteps.map((step, i) => (
                <span key={i} className="rounded-full bg-white px-2 py-0.5 ring-1 ring-gray-200 text-gray-600">
                  {vehicleIcon(step.vehicleType)} {step.lineShortName ?? step.lineName ?? ""}
                </span>
              ))}
            </div>
          )}

          {/* Transit expanded detail */}
          {!isNav && expanded && leg.transitSteps.length > 0 && (
            <div className="mt-2 space-y-2">
              {leg.transitSteps.map((step: TransitStep, i: number) => (
                <div key={i} className="rounded-lg bg-white p-2 ring-1 ring-gray-100">
                  <div className="flex items-center gap-1.5 font-medium text-gray-700">
                    <span>{vehicleIcon(step.vehicleType)}</span>
                    <span>{step.lineName ?? step.lineShortName ?? ""}</span>
                    {step.numStops && <span className="text-gray-400">({step.numStops}駅)</span>}
                  </div>
                  {step.departureStop && step.arrivalStop && (
                    <div className="mt-1 text-gray-500">
                      {step.departureStop}
                      {step.departureTime && <span className="ml-1 text-blue-500">({step.departureTime})</span>}
                      {" → "}
                      {step.arrivalStop}
                      {step.arrivalTime && <span className="ml-1 text-blue-500">({step.arrivalTime})</span>}
                    </div>
                  )}
                  {step.duration && <div className="text-gray-400">{step.duration}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SpotRow
// ---------------------------------------------------------------------------
interface SpotRowProps {
  spot: Spot;
  dayDate: string;
  color: string;
  isSelected: boolean;
  onClick: () => void;
}

function SpotRow({ spot, dayDate, color, isSelected, onClick }: SpotRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: spot.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };
  const outsideHours = isOutsideHours(spot, dayDate);

  return (
    <div
      ref={setNodeRef}
      style={style}
      onClick={onClick}
      className={`flex items-center gap-2 rounded-xl px-3 py-2.5 cursor-pointer transition ${
        isSelected ? "bg-blue-50 ring-1 ring-blue-300" : "hover:bg-gray-50"
      }`}
    >
      <div {...attributes} {...listeners} className="cursor-grab text-gray-300 hover:text-gray-500">
        <GripVertical size={14} />
      </div>
      <div className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-800 truncate">{spot.name}</p>
        {spot.startTime && (
          <p className="flex items-center gap-1 text-xs text-gray-400">
            <Clock size={10} />
            {spot.startTime}{spot.duration ? ` (${spot.duration}分)` : ""}
          </p>
        )}
      </div>
      {outsideHours && (
        <div className="group relative">
          <AlertTriangle size={14} className="text-amber-500" />
          <div className="absolute right-0 top-full z-50 mt-1 hidden w-52 rounded-xl bg-gray-800 px-3 py-2 text-xs text-white shadow-lg group-hover:block">
            <p className="font-semibold mb-1">営業時間外の可能性</p>
            {spot.openingHours?.weekdayText.map((t, i) => (
              <p key={i} className="text-gray-300">{t}</p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DayBlock
// ---------------------------------------------------------------------------
interface DayBlockProps {
  day: Day;
  dayIndex: number;
  selectedSpotId: string | null;
  onSelectSpot: (dayId: string, spotId: string) => void;
  onAddSpot: (dayId: string) => void;
  onReorder: (dayId: string, spots: Spot[]) => void;
  onLegsChange: (dayId: string, legs: RouteLeg[]) => void;
  onRouteSave: (dayId: string, key: string, route: SavedRoute | null) => void;
}

function DayBlock({ day, dayIndex, selectedSpotId, onSelectSpot, onAddSpot, onReorder, onLegsChange, onRouteSave }: DayBlockProps) {
  const [collapsed, setCollapsed] = useState(false);
  const color = getDayColor(dayIndex);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: `day-${day.id}` });

  // Bug3: selectedSpotId が外部（地図マーカー等）から変化したとき自動展開
  useEffect(() => {
    if (selectedSpotId && day.spots.some((s) => s.id === selectedSpotId)) {
      setCollapsed(false);
    }
  }, [selectedSpotId, day.spots]);

  // Per-leg state indexed by spot order index
  const legsRef = useRef<(RouteLeg | null)[]>([]);

  function handleLegChange(spotIdx: number, leg: RouteLeg | null) {
    const next = [...legsRef.current];
    while (next.length <= spotIdx) next.push(null);
    next[spotIdx] = leg;
    legsRef.current = next;
    onLegsChange(day.id, next.filter((l): l is RouteLeg => l !== null));
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const sortedSpots = day.spots.slice().sort((a, b) => a.order - b.order);
    const oldIndex = sortedSpots.findIndex((s) => s.id === active.id);
    const newIndex = sortedSpots.findIndex((s) => s.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const newSortedSpots = arrayMove(sortedSpots, oldIndex, newIndex);

    // Bug6: 隣接ペアが変わらない leg は保持し、新しいペアだけ null にする
    const oldLegs = [...legsRef.current];
    const newLegs: (RouteLeg | null)[] = newSortedSpots.slice(0, -1).map((spot, i) => {
      const nextSpot = newSortedSpots[i + 1];
      const oldPairIdx = sortedSpots.findIndex(
        (s, j) => j < sortedSpots.length - 1 && s.id === spot.id && sortedSpots[j + 1].id === nextSpot.id
      );
      return oldPairIdx >= 0 ? (oldLegs[oldPairIdx] ?? null) : null;
    });
    legsRef.current = newLegs;
    onLegsChange(day.id, newLegs.filter((l): l is RouteLeg => l !== null));
    onReorder(day.id, newSortedSpots);
  }

  const sortedSpots = day.spots.slice().sort((a, b) => a.order - b.order);

  return (
    <div ref={setDropRef} className={`mb-3 rounded-xl transition ${isOver ? "ring-2 ring-blue-400 bg-blue-50/50" : ""}`}>
      <button
        onClick={() => setCollapsed((c) => !c)}
        className="flex w-full items-center gap-2 rounded-xl px-3 py-2 hover:bg-gray-100"
      >
        <div className="h-3 w-3 rounded-full" style={{ backgroundColor: color }} />
        <span className="flex-1 text-left text-sm font-semibold text-gray-700">
          Day {dayIndex + 1} · {formatDate(day.date)}
        </span>
        <span className="text-xs text-gray-400">{day.spots.length}件</span>
        {collapsed ? <ChevronDown size={14} className="text-gray-400" /> : <ChevronUp size={14} className="text-gray-400" />}
      </button>

      {!collapsed && (
        <div className="mt-1 ml-2 border-l-2 pl-3" style={{ borderColor: color + "60" }}>
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={sortedSpots.map((s) => s.id)} strategy={verticalListSortingStrategy}>
              {sortedSpots.map((spot, spotIdx) => (
                <div key={spot.id}>
                  <SpotRow
                    spot={spot}
                    dayDate={day.date}
                    color={color}
                    isSelected={selectedSpotId === spot.id}
                    onClick={() => onSelectSpot(day.id, spot.id)}
                  />
                  {spotIdx < sortedSpots.length - 1 && (
                    <LegConnector
                      key={`${spot.id}-${sortedSpots[spotIdx + 1].id}`}
                      fromSpot={sortedSpots[spotIdx]}
                      toSpot={sortedSpots[spotIdx + 1]}
                      dayDate={day.date}
                      savedRoute={day.routes?.[`${spot.id}-${sortedSpots[spotIdx + 1].id}`] ?? null}
                      onLegChange={(leg) => handleLegChange(spotIdx, leg)}
                      onRouteSave={(route) => onRouteSave(day.id, `${spot.id}-${sortedSpots[spotIdx + 1].id}`, route)}
                    />
                  )}
                </div>
              ))}
            </SortableContext>
          </DndContext>
          <button
            onClick={() => onAddSpot(day.id)}
            className="mt-1 flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-gray-400 hover:bg-gray-50 hover:text-blue-500"
          >
            <Plus size={14} />
            スポットを追加
          </button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ItineraryPanel
// ---------------------------------------------------------------------------
interface Props {
  trip: Trip;
  selectedSpotId: string | null;
  selectedDayId: string | null;
  onSelectSpot: (dayId: string, spotId: string) => void;
  onAddSpot: (dayId: string) => void;
  onReorder: (dayId: string, spots: Spot[]) => void;
  onLegsChange: (dayId: string, legs: RouteLeg[]) => void;
  onRouteSave: (dayId: string, key: string, route: SavedRoute | null) => void;
}

export function ItineraryPanel({ trip, selectedSpotId, selectedDayId, onSelectSpot, onAddSpot, onReorder, onLegsChange, onRouteSave }: Props) {
  return (
    <div className="h-full overflow-y-auto p-3">
      {trip.days.map((day, i) => (
        <DayBlock
          key={day.id}
          day={day}
          dayIndex={i}
          selectedSpotId={selectedDayId === day.id ? selectedSpotId : null}
          onSelectSpot={onSelectSpot}
          onAddSpot={onAddSpot}
          onReorder={onReorder}
          onLegsChange={onLegsChange}
          onRouteSave={onRouteSave}
        />
      ))}
    </div>
  );
}

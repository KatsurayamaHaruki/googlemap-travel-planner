"use client";
import { useState, use, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Share2, Plus, ChevronUp, ChevronDown, Settings } from "lucide-react";
import { APIProvider } from "@vis.gl/react-google-maps";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from "@dnd-kit/core";
import { useTripStore } from "@/store/tripStore";
import { ItineraryPanel } from "@/components/ItineraryPanel";
import { CandidatePanel } from "@/components/CandidatePanel";
import { TripMap } from "@/components/TripMap";
import { SpotSearchModal } from "@/components/SpotSearchModal";
import { SpotDetailPanel } from "@/components/SpotDetailPanel";
import { PendingSpotCard } from "@/components/PendingSpotCard";
import type { PendingSpot } from "@/components/PendingSpotCard";
import { encodeShareData } from "@/lib/utils";
import type { Spot } from "@/types";
import type { RouteLeg } from "@/hooks/useDirections";

const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

function TripPageInner({ id }: { id: string }) {
  const router = useRouter();
  const { trips, loading, loadTrips, addSpot, updateSpot, removeSpot, reorderSpots, addCandidate, removeCandidate, promoteCandidate } = useTripStore();
  const trip = trips.find((t) => t.id === id);

  useEffect(() => {
    loadTrips();
  }, [loadTrips]);

  const [selectedDayId, setSelectedDayId] = useState<string | null>(null);
  const [selectedSpotId, setSelectedSpotId] = useState<string | null>(null);
  const [searchDayId, setSearchDayId] = useState<string | null>(null);
  const [pendingSpot, setPendingSpot] = useState<PendingSpot | null>(null);
  const [showShareToast, setShowShareToast] = useState(false);
  const [isDraggingPending, setIsDraggingPending] = useState(false);
  const [legsByDay, setLegsByDay] = useState<Map<string, RouteLeg[]>>(new Map());
  const [panelTab, setPanelTab] = useState<"itinerary" | "candidates">("itinerary");
  const [mobileSheetExpanded, setMobileSheetExpanded] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const handleSelectSpot = useCallback((dayId: string, spotId: string) => {
    setSelectedDayId(dayId);
    setSelectedSpotId(spotId);
  }, []);

  const handleLegsChange = useCallback((dayId: string, legs: RouteLeg[]) => {
    setLegsByDay((prev) => {
      const next = new Map(prev);
      next.set(dayId, legs);
      return next;
    });
  }, []);

  function addPendingToDay(dayId: string) {
    if (!pendingSpot || !trip) return;
    addSpot(trip.id, dayId, {
      name: pendingSpot.name,
      lat: pendingSpot.lat,
      lng: pendingSpot.lng,
      address: pendingSpot.address,
      placeId: pendingSpot.placeId,
      website: pendingSpot.website,
      memo: "",
      photos: pendingSpot.photos,
      openingHours: pendingSpot.openingHours,
    });
    setPendingSpot(null);
  }

  function addPendingToCandidate() {
    if (!pendingSpot || !trip) return;
    addCandidate(trip.id, {
      name: pendingSpot.name,
      lat: pendingSpot.lat,
      lng: pendingSpot.lng,
      address: pendingSpot.address,
      placeId: pendingSpot.placeId,
      website: pendingSpot.website,
      memo: "",
      photos: pendingSpot.photos,
      openingHours: pendingSpot.openingHours,
    });
    setPendingSpot(null);
    setPanelTab("candidates");
  }

  function handleGlobalDragEnd(event: DragEndEvent) {
    setIsDraggingPending(false);
    const { active, over } = event;
    if (!over) return;
    if (active.id === "pending-spot" && typeof over.id === "string" && over.id.startsWith("day-")) {
      addPendingToDay(over.id.replace("day-", ""));
    }
  }

  function handleShare() {
    if (!trip) return;
    const encoded = encodeShareData(trip);
    const url = `${window.location.origin}/share?data=${encoded}`;
    navigator.clipboard.writeText(url).then(() => {
      setShowShareToast(true);
      setTimeout(() => setShowShareToast(false), 2500);
    });
  }

  if (loading && !trip) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-400 border-t-transparent" />
      </div>
    );
  }

  if (!trip) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500">旅行が見つかりません</p>
          <button onClick={() => router.push("/")} className="mt-4 text-sm text-blue-600 hover:underline">
            一覧に戻る
          </button>
        </div>
      </div>
    );
  }

  const selectedDayObj = trip.days.find((d) => d.id === selectedDayId);
  const selectedSpot = selectedDayObj?.spots.find((s) => s.id === selectedSpotId);

  // Height of the mobile bottom sheet
  const sheetExpanded = mobileSheetExpanded || !!(selectedSpot && selectedDayObj);

  // Panel content shared between desktop sidebar and mobile bottom sheet
  const panelContent = selectedSpot && selectedDayObj ? (
    <SpotDetailPanel
      spot={selectedSpot}
      onClose={() => { setSelectedSpotId(null); setSelectedDayId(null); }}
      onUpdate={(data) => updateSpot(trip.id, selectedDayObj.id, selectedSpot.id, data)}
      onDelete={() => {
        removeSpot(trip.id, selectedDayObj.id, selectedSpot.id);
        setSelectedSpotId(null);
        setSelectedDayId(null);
      }}
    />
  ) : (
    <>
      <div className="border-b border-gray-100 px-3 py-2 shrink-0">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setPanelTab("itinerary")}
            className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition ${
              panelTab === "itinerary"
                ? "bg-blue-600 text-white"
                : "text-gray-500 hover:bg-gray-100"
            }`}
          >
            日程
          </button>
          <button
            onClick={() => setPanelTab("candidates")}
            className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition ${
              panelTab === "candidates"
                ? "bg-blue-600 text-white"
                : "text-gray-500 hover:bg-gray-100"
            }`}
          >
            候補
            {(trip.candidates ?? []).length > 0 && (
              <span className="ml-1 rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] text-blue-700">
                {trip.candidates.length}
              </span>
            )}
          </button>
          {panelTab === "itinerary" && (
            <button
              onClick={() => setSearchDayId(trip.days[0]?.id ?? null)}
              className="ml-1 flex items-center gap-1 rounded-lg bg-blue-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
            >
              <Plus size={12} />
              追加
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-hidden min-h-0">
        {panelTab === "itinerary" ? (
          <ItineraryPanel
            trip={trip}
            selectedSpotId={selectedSpotId}
            selectedDayId={selectedDayId}
            onSelectSpot={handleSelectSpot}
            onAddSpot={(dayId) => setSearchDayId(dayId)}
            onReorder={(dayId, spots) => reorderSpots(trip.id, dayId, spots)}
            onLegsChange={handleLegsChange}
          />
        ) : (
          <CandidatePanel
            trip={trip}
            onPromote={(dayId, candidateId) => promoteCandidate(trip.id, dayId, candidateId)}
            onRemove={(candidateId) => removeCandidate(trip.id, candidateId)}
          />
        )}
      </div>
    </>
  );

  return (
    <DndContext
      sensors={sensors}
      onDragStart={(e) => { if (e.active.id === "pending-spot") setIsDraggingPending(true); }}
      onDragEnd={handleGlobalDragEnd}
      onDragCancel={() => setIsDraggingPending(false)}
    >
      <DragOverlay>
        {isDraggingPending && pendingSpot && (
          <div className="w-64 rounded-xl bg-white px-4 py-2.5 shadow-2xl ring-1 ring-blue-400 text-sm font-semibold text-gray-800">
            {pendingSpot.name}
          </div>
        )}
      </DragOverlay>

      <div className="flex h-screen flex-col bg-white">
        {/* Header */}
        <header
          className="flex shrink-0 items-center gap-3 border-b border-gray-200 px-4 py-3"
          style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
        >
          <button onClick={() => router.push("/")} className="rounded-lg p-1.5 hover:bg-gray-100">
            <ArrowLeft size={18} className="text-gray-600" />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="truncate font-bold text-gray-800">{trip.title}</h1>
            <p className="text-xs text-gray-500">{trip.destination} · {trip.days.length}日間</p>
          </div>
          <button
            onClick={handleShare}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
          >
            <Share2 size={14} />
            <span className="hidden sm:inline">共有</span>
          </button>
          <button
            onClick={() => router.push("/settings")}
            className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
            title="設定"
          >
            <Settings size={14} />
          </button>
        </header>

        {/* Main content area */}
        <div className="relative flex flex-1 overflow-hidden min-h-0">
          {/* Side panel: sidebar on desktop, bottom sheet on mobile */}
          <div
            className={[
              "flex flex-col bg-white overflow-hidden z-10",
              // Mobile: absolute bottom sheet with animated height
              "absolute bottom-0 left-0 right-0 rounded-t-3xl transition-[height] duration-300",
              "shadow-[0_-4px_24px_rgba(0,0,0,0.10)]",
              sheetExpanded ? "h-[72vh]" : "h-[200px]",
              // Desktop: back to sidebar
              "md:relative md:rounded-none md:shadow-none",
              "md:w-80 md:shrink-0 md:border-r md:border-gray-200",
              "md:h-auto",
            ].join(" ")}
            style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
          >
            {/* Handle bar — mobile only */}
            <button
              className="md:hidden flex w-full items-center justify-center gap-2 py-3 shrink-0 active:bg-gray-50 touch-none"
              onClick={() => {
                if (selectedSpot && selectedDayObj) {
                  setSelectedSpotId(null);
                  setSelectedDayId(null);
                } else {
                  setMobileSheetExpanded((v) => !v);
                }
              }}
              aria-label={sheetExpanded ? "パネルを閉じる" : "パネルを開く"}
            >
              <div className="h-1 w-10 rounded-full bg-gray-200" />
              {sheetExpanded ? (
                <ChevronDown size={14} className="text-gray-300" />
              ) : (
                <ChevronUp size={14} className="text-gray-300" />
              )}
            </button>

            {/* Panel content */}
            <div className="flex flex-1 flex-col overflow-hidden min-h-0">
              {panelContent}
            </div>
          </div>

          {/* Map */}
          <div className="flex-1 relative min-w-0">
            <TripMap
              trip={trip}
              selectedSpotId={selectedSpotId}
              selectedDayId={selectedDayId}
              legsByDay={legsByDay}
              onSelectSpot={handleSelectSpot}
              onPendingSpot={(spot) => { setPendingSpot(spot); setSelectedSpotId(null); }}
            >
              {pendingSpot && (
                <PendingSpotCard
                  spot={pendingSpot}
                  trip={trip}
                  onAddToDay={addPendingToDay}
                  onAddToCandidate={addPendingToCandidate}
                  onClose={() => setPendingSpot(null)}
                />
              )}
            </TripMap>
          </div>
        </div>

        {searchDayId && (
          <SpotSearchModal
            onClose={() => setSearchDayId(null)}
            onSelect={(place) => {
              addSpot(trip.id, searchDayId, {
                name: place.name,
                lat: place.lat,
                lng: place.lng,
                address: place.address,
                placeId: place.placeId,
                website: place.website,
                memo: "",
                photos: place.photos,
                openingHours: place.openingHours,
              });
            }}
          />
        )}

        {showShareToast && (
          <div
            className="fixed bottom-6 left-1/2 -translate-x-1/2 rounded-full bg-gray-800 px-5 py-2.5 text-sm text-white shadow-lg"
            style={{ bottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
          >
            URLをクリップボードにコピーしました
          </div>
        )}
      </div>
    </DndContext>
  );
}

interface PageProps {
  params: Promise<{ id: string }>;
}

export default function TripPage({ params }: PageProps) {
  const { id } = use(params);
  return (
    <APIProvider apiKey={API_KEY} libraries={["places", "routes"]}>
      <TripPageInner id={id} />
    </APIProvider>
  );
}

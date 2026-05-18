"use client";
import { useState, use, useCallback, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Share2, Plus, ChevronUp, ChevronDown, Settings, Users, AlertCircle, Trash2 } from "lucide-react";
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
import { InviteModal } from "@/components/InviteModal";
import type { PendingSpot } from "@/components/PendingSpotCard";
import { encodeShareData } from "@/lib/utils";
import type { Spot } from "@/types";
import type { RouteLeg } from "@/hooks/useDirections";

const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

function TripPageInner({ id }: { id: string }) {
  const router = useRouter();
  const { trips, loading, loadTrips, addSpot, updateSpot, removeSpot, reorderSpots, addCandidate, removeCandidate, promoteCandidate, updateDayRoute, deleteTrip, syncError, clearSyncError } = useTripStore();
  const trip = trips.find((t) => t.id === id);

  // ── State ──────────────────────────────────────────────
  const [selectedDayId, setSelectedDayId] = useState<string | null>(null);
  const [selectedSpotId, setSelectedSpotId] = useState<string | null>(null);
  const [searchDayId, setSearchDayId] = useState<string | null>(null);
  const [pendingSpot, setPendingSpot] = useState<PendingSpot | null>(null);
  const [showShareToast, setShowShareToast] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isDraggingPending, setIsDraggingPending] = useState(false);
  const [legsByDay, setLegsByDay] = useState<Map<string, RouteLeg[]>>(new Map());
  const [panelTab, setPanelTab] = useState<"itinerary" | "candidates">("itinerary");

  const isOwner = trip?.role === "owner";
  const isReadOnly = trip?.role === "viewer";

  // Bottom sheet drag state
  const COLLAPSED_H = 200;
  const [sheetH, setSheetH] = useState(COLLAPSED_H);
  const [sheetDragging, setSheetDragging] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const dragRef = useRef({ startY: 0, startH: 0, wasDrag: false });

  // ── Helpers ─────────────────────────────────────────────
  function getExpandedH() { return Math.round(window.innerHeight * 0.72); }

  function applyRubberBand(h: number, min: number, max: number) {
    if (h < min) return min - Math.min((min - h) * 0.3, 60);
    if (h > max) return max + Math.min((h - max) * 0.3, 60);
    return h;
  }

  // ── Effects ─────────────────────────────────────────────
  useEffect(() => {
    loadTrips();
  }, [loadTrips]);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  useEffect(() => {
    if (selectedSpotId && isMobile) setSheetH(getExpandedH());
  }, [selectedSpotId, isMobile]);

  // ── Sheet drag handlers ──────────────────────────────────
  function onHandleTouchStart(e: React.TouchEvent) {
    dragRef.current = { startY: e.touches[0].clientY, startH: sheetH, wasDrag: false };
    setSheetDragging(true);
  }

  function onHandleTouchMove(e: React.TouchEvent) {
    const dy = dragRef.current.startY - e.touches[0].clientY;
    if (Math.abs(dy) > 5) dragRef.current.wasDrag = true;
    setSheetH(applyRubberBand(dragRef.current.startH + dy, COLLAPSED_H, getExpandedH()));
  }

  function onHandleTouchEnd(e: React.TouchEvent) {
    setSheetDragging(false);
    const dy = dragRef.current.startY - e.changedTouches[0].clientY;
    const exp = getExpandedH();
    const mid = (COLLAPSED_H + exp) / 2;

    if (!dragRef.current.wasDrag) {
      if (selectedSpot && selectedDayObj) {
        setSelectedSpotId(null); setSelectedDayId(null);
        return;
      }
      setSheetH(h => h > mid ? COLLAPSED_H : exp);
      return;
    }
    if (dy > 40) setSheetH(exp);
    else if (dy < -40) setSheetH(COLLAPSED_H);
    else setSheetH(h => h > mid ? exp : COLLAPSED_H);
  }

  function onHandleClick() {
    if (selectedSpot && selectedDayObj) {
      setSelectedSpotId(null); setSelectedDayId(null);
      return;
    }
    const exp = getExpandedH();
    const mid = (COLLAPSED_H + exp) / 2;
    setSheetH(h => h > mid ? COLLAPSED_H : exp);
  }

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

  const handleRouteSave = useCallback((dayId: string, key: string, route: import("@/types").SavedRoute | null) => {
    if (trip) updateDayRoute(trip.id, dayId, key, route);
  }, [trip, updateDayRoute]);

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

  const sheetExpanded = sheetH > 300 || !!(selectedSpot && selectedDayObj);

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
          {panelTab === "itinerary" && !isReadOnly && (
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
            onRouteSave={handleRouteSave}
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
        {syncError && (
          <div className="shrink-0 bg-red-50 border-b border-red-200 px-4 py-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs text-red-700">
              <AlertCircle size={14} className="shrink-0" />
              <span>{syncError}</span>
            </div>
            <button onClick={clearSyncError} className="text-red-400 hover:text-red-600 text-xs">✕</button>
          </div>
        )}
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
          {isOwner && (
            <button
              onClick={() => setShowInviteModal(true)}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
              title="共有・メンバー管理"
            >
              <Users size={14} />
              <span className="hidden sm:inline">共有</span>
            </button>
          )}
          {!isOwner && !isReadOnly && (
            <button
              onClick={handleShare}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50"
            >
              <Share2 size={14} />
              <span className="hidden sm:inline">共有</span>
            </button>
          )}
          {isReadOnly && (
            <span className="rounded-full border border-gray-200 px-3 py-1.5 text-xs text-gray-400">
              閲覧のみ
            </span>
          )}
          {isOwner && (
            <button
              onClick={() => setConfirmDelete(true)}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-500 hover:bg-red-50 hover:text-red-500 hover:border-red-200"
              title="旅行を削除"
            >
              <Trash2 size={14} />
            </button>
          )}
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
              "absolute bottom-0 left-0 right-0 rounded-t-3xl h-[200px]",
              "shadow-[0_-4px_24px_rgba(0,0,0,0.10)]",
              "md:relative md:rounded-none md:shadow-none",
              "md:w-80 md:shrink-0 md:border-r md:border-gray-200",
              "md:!h-auto",
            ].join(" ")}
            style={{
              ...(isMobile ? {
                height: sheetH,
                transition: sheetDragging ? "none" : "height 300ms ease",
              } : {}),
              paddingBottom: "env(safe-area-inset-bottom, 0px)",
            }}
          >
            {/* Handle bar — mobile only (drag to resize) */}
            <div
              className="md:hidden flex w-full items-center justify-center gap-2 py-4 shrink-0 active:bg-gray-50 touch-none cursor-row-resize select-none"
              onTouchStart={onHandleTouchStart}
              onTouchMove={onHandleTouchMove}
              onTouchEnd={onHandleTouchEnd}
              onClick={onHandleClick}
              role="button"
              aria-label={sheetExpanded ? "パネルを閉じる" : "パネルを開く"}
            >
              <div className="h-1.5 w-12 rounded-full bg-gray-200" />
              {sheetExpanded ? (
                <ChevronDown size={14} className="text-gray-300" />
              ) : (
                <ChevronUp size={14} className="text-gray-300" />
              )}
            </div>

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

      {showInviteModal && (
        <InviteModal tripId={trip.id} onClose={() => setShowInviteModal(false)} />
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-80 rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="mb-2 font-semibold text-gray-800">旅行を削除しますか？</h3>
            <p className="mb-5 text-sm text-gray-500">この操作は取り消せません。</p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDelete(false)}
                className="flex-1 rounded-lg border border-gray-300 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                キャンセル
              </button>
              <button
                onClick={() => { deleteTrip(trip.id); router.push("/"); }}
                className="flex-1 rounded-lg bg-red-500 py-2 text-sm text-white hover:bg-red-600"
              >
                削除
              </button>
            </div>
          </div>
        </div>
      )}
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

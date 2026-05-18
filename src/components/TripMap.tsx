"use client";
import { useEffect, useRef, useCallback, useState, useMemo } from "react";
import {
  Map,
  AdvancedMarker,
  Pin,
  useMap,
  InfoWindow,
  useMapsLibrary,
  type MapMouseEvent,
  type MapCameraChangedEvent,
} from "@vis.gl/react-google-maps";
import type { Trip, CulturalProperty, CulturalPropertyCategory } from "@/types";
import type { PendingSpot } from "@/components/PendingSpotCard";
import { getDayColor } from "@/lib/utils";
import { extractOpeningHoursFromPlace } from "@/lib/openingHours";
import type { RouteLeg } from "@/hooks/useDirections";
import {
  CATEGORY_COLOR,
  CATEGORY_LABEL,
  clusterCulturalProperties,
  type CulturalPropertyCluster,
} from "@/lib/cultural-properties";
import { useSettingsStore } from "@/store/settingsStore";

// ---------------------------------------------------------------------------
// 文化財カスタムマーカー（単体用）
// ---------------------------------------------------------------------------
function CulturalMarkerPin({ category }: { category: CulturalPropertyCategory }) {
  return (
    <div
      style={{
        width: 32,
        height: 32,
        borderRadius: "50%",
        background: CATEGORY_COLOR[category] ?? "#555",
        color: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 9,
        fontWeight: "bold",
        fontFamily: "sans-serif",
        letterSpacing: "-0.5px",
        boxShadow: "0 2px 6px rgba(0,0,0,0.40)",
        border: "2px solid #fff",
        cursor: "pointer",
        userSelect: "none",
      }}
    >
      {CATEGORY_LABEL[category] ?? "文"}
    </div>
  );
}

// ---------------------------------------------------------------------------
// クラスタマーカー（複数件まとめ）
// ---------------------------------------------------------------------------
function ClusterPin({
  count,
  topCategory,
}: {
  count: number;
  topCategory: CulturalPropertyCategory;
}) {
  return (
    <div
      style={{
        minWidth: 38,
        height: 38,
        borderRadius: 19,
        background: CATEGORY_COLOR[topCategory] ?? "#555",
        color: "#fff",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 11,
        fontWeight: "bold",
        fontFamily: "sans-serif",
        padding: "0 10px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.45)",
        border: "2px solid #fff",
        cursor: "pointer",
        userSelect: "none",
        whiteSpace: "nowrap",
        gap: 3,
      }}
    >
      <span style={{ fontSize: 9, opacity: 0.85 }}>文</span>
      {count}
    </div>
  );
}

// ---------------------------------------------------------------------------
// InfoWindow 内コンテンツ: 単体の文化財
// ---------------------------------------------------------------------------
function SingleCPContent({
  cp,
  onAdd,
}: {
  cp: CulturalProperty;
  onAdd: (cp: CulturalProperty) => void;
}) {
  const allCategories =
    cp.categories?.length > 1 ? cp.categories.join(" ／ ") : cp.category;

  return (
    <div className="max-w-[210px]">
      {cp.image_url && (
        <img
          src={cp.image_url}
          alt={cp.name}
          className="mb-2 h-24 w-full rounded object-cover"
          onError={(e) => {
            (e.currentTarget as HTMLImageElement).style.display = "none";
          }}
        />
      )}
      <p
        className="text-[10px] font-semibold"
        style={{ color: CATEGORY_COLOR[cp.category] }}
      >
        {allCategories}
      </p>
      <p className="text-sm font-bold text-gray-800">{cp.name}</p>
      {cp.description && (
        <p className="mt-0.5 line-clamp-2 text-xs text-gray-500">{cp.description}</p>
      )}
      <button
        onClick={() => onAdd(cp)}
        className="mt-2 w-full rounded-lg bg-blue-600 py-1 text-xs font-semibold text-white hover:bg-blue-700"
      >
        スポットに追加
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// InfoWindow 内コンテンツ: 複数件クラスタ
// ---------------------------------------------------------------------------
function ClusterContent({
  cluster,
  onAdd,
}: {
  cluster: CulturalPropertyCluster;
  onAdd: (cp: CulturalProperty) => void;
}) {
  const preview = cluster.items.slice(0, 5);
  return (
    <div className="max-w-[220px]">
      <p className="mb-1.5 text-xs font-bold text-gray-700">
        {cluster.items.length} 件の文化財
      </p>
      <div className="space-y-1">
        {preview.map((cp) => (
          <button
            key={cp.id}
            onClick={() => onAdd(cp)}
            className="flex w-full items-center gap-1.5 rounded-lg px-2 py-1 text-left hover:bg-gray-50"
          >
            <span
              className="inline-block shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold text-white"
              style={{ background: CATEGORY_COLOR[cp.category] }}
            >
              {CATEGORY_LABEL[cp.category]}
            </span>
            <span className="truncate text-xs text-gray-800">{cp.name}</span>
          </button>
        ))}
      </div>
      {cluster.items.length > 5 && (
        <p className="mt-1 text-center text-[10px] text-gray-400">
          他 {cluster.items.length - 5} 件 — ズームインで個別表示
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Route layer
// ---------------------------------------------------------------------------
interface RouteLayerProps {
  trip: Trip;
  selectedDayIndex: number;
  legsByDay: Map<string, RouteLeg[]>;
}

function RouteLayer({ trip, selectedDayIndex, legsByDay }: RouteLayerProps) {
  const map = useMap();
  const polylinesRef = useRef<google.maps.Polyline[]>([]);

  useEffect(() => {
    if (!map) return;
    polylinesRef.current.forEach((p) => p.setMap(null));
    polylinesRef.current = [];

    trip.days.forEach((day, dayIdx) => {
      const isSelected = dayIdx === selectedDayIndex;
      const color = getDayColor(dayIdx);
      const legs = legsByDay.get(day.id);

      if (legs && legs.length > 0) {
        legs.forEach((leg) => {
          if (!leg.overviewPath?.length) return;
          const polyline = new google.maps.Polyline({
            path: leg.overviewPath,
            strokeColor: color,
            strokeOpacity: isSelected ? 0.9 : 0.25,
            strokeWeight: isSelected ? 4 : 2,
            map,
          });
          polylinesRef.current.push(polyline);
        });
      } else {
        const sortedSpots = day.spots.slice().sort((a, b) => a.order - b.order);
        if (sortedSpots.length < 2) return;
        const path = sortedSpots.map((s) => ({ lat: s.lat, lng: s.lng }));
        const polyline = new google.maps.Polyline({
          path,
          geodesic: true,
          strokeColor: color,
          strokeOpacity: isSelected ? 0.5 : 0.2,
          strokeWeight: isSelected ? 2 : 1,
          map,
        });
        polylinesRef.current.push(polyline);
      }
    });

    return () => {
      polylinesRef.current.forEach((p) => p.setMap(null));
    };
  }, [map, trip, selectedDayIndex, legsByDay]);

  return null;
}

// ---------------------------------------------------------------------------
// POI click hook（Google Maps 組み込み POI + 文化財近傍マッチ）
// ---------------------------------------------------------------------------
function usePOIClick(
  onPendingSpot: (spot: PendingSpot) => void,
  // ref を使うことで culturalProperties が変わっても callback を再生成しない
  culturalPropertiesRef: React.MutableRefObject<CulturalProperty[]>
) {
  const placesLib = useMapsLibrary("places");

  return useCallback(
    (e: MapMouseEvent) => {
      const placeId = e.detail.placeId;
      if (!placeId || !placesLib) return;
      e.stop();

      const place = new placesLib.Place({ id: placeId });
      place
        .fetchFields({
          fields: [
            "displayName",
            "location",
            "formattedAddress",
            "regularOpeningHours",
            "photos",
            "websiteURI",
            "rating",
            "userRatingCount",
            "editorialSummary",
            "priceLevel",
            "nationalPhoneNumber",
            "primaryType",
            "parkingOptions",
          ],
        })
        .then(() => {
          if (!place.location) return;
          const lat = place.location.lat();
          const lng = place.location.lng();

          const photos = (place.photos ?? [])
            .slice(0, 3)
            .map((p) => p.getURI({ maxWidth: 800 }))
            .filter(Boolean) as string[];

          const nearbyCP = culturalPropertiesRef.current.find(
            (cp) => Math.hypot(cp.lat - lat, cp.lng - lng) < 0.001
          );

          type PlaceExtra = {
            websiteURI?: string;
            rating?: number;
            userRatingCount?: number;
            editorialSummary?: string;
            priceLevel?: string;
            nationalPhoneNumber?: string;
            primaryType?: string;
            parkingOptions?: Record<string, boolean>;
          };
          const p = place as unknown as PlaceExtra;

          onPendingSpot({
            name: place.displayName ?? "",
            lat,
            lng,
            address: place.formattedAddress ?? "",
            placeId,
            website: nearbyCP?.wikipedia_url ?? p.websiteURI ?? undefined,
            photos,
            openingHours: place.regularOpeningHours
              ? extractOpeningHoursFromPlace(place.regularOpeningHours)
              : undefined,
            rating: p.rating,
            userRatingCount: p.userRatingCount,
            editorialSummary: p.editorialSummary,
            priceLevel: p.priceLevel,
            phoneNumber: p.nationalPhoneNumber,
            primaryType: p.primaryType,
            parkingOptions: p.parkingOptions,
            culturalCategory: nearbyCP?.category,
            culturalCategories:
              nearbyCP?.categories?.length ? nearbyCP.categories : undefined,
          });
        })
        .catch((err) => {
          console.error("[TripMap] POI fetchFields failed:", err);
        });
    },
    [placesLib, onPendingSpot]
    // culturalPropertiesRef は ref なので deps 不要
  );
}

// ---------------------------------------------------------------------------
// TripMap props
// ---------------------------------------------------------------------------
interface Props {
  trip: Trip;
  selectedSpotId: string | null;
  selectedDayId: string | null;
  legsByDay: Map<string, RouteLeg[]>;
  onSelectSpot: (dayId: string, spotId: string) => void;
  onPendingSpot: (spot: PendingSpot) => void;
  children?: React.ReactNode;
}

// ---------------------------------------------------------------------------
// 文化財 → PendingSpot 変換
// ---------------------------------------------------------------------------
function culturalPropertyToPendingSpot(cp: CulturalProperty): PendingSpot {
  return {
    name: cp.name,
    lat: cp.lat,
    lng: cp.lng,
    address: cp.description ?? cp.category,
    placeId: `wikidata:${cp.wikidata_id}`,
    website: cp.wikipedia_url ?? undefined,
    photos: cp.image_url ? [cp.image_url] : [],
    culturalCategory: cp.category,
    culturalCategories: cp.categories?.length > 1 ? cp.categories : undefined,
  };
}

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------
const MIN_ZOOM_FOR_CULTURAL = 10;
const BOUNDS_DEBOUNCE_MS = 800;

// ---------------------------------------------------------------------------
// TripMap
// ---------------------------------------------------------------------------
export function TripMap({
  trip,
  selectedSpotId,
  selectedDayId,
  legsByDay,
  onSelectSpot,
  onPendingSpot,
  children,
}: Props) {
  const selectedDayIndex = trip.days.findIndex((d) => d.id === selectedDayId);

  const allSpots = trip.days.flatMap((d) => d.spots);
  const center =
    allSpots.length > 0
      ? {
          lat: allSpots.reduce((s, p) => s + p.lat, 0) / allSpots.length,
          lng: allSpots.reduce((s, p) => s + p.lng, 0) / allSpots.length,
        }
      : { lat: 35.6812, lng: 139.7671 };

  // ── 設定 ────────────────────────────────────────────────────────────
  const { showCulturalProperties, enabledCategories } = useSettingsStore();

  // スポットがない場合、目的地をジオコーディングしてマップを移動
  const geocodingLib = useMapsLibrary("geocoding");
  const map = useMap();
  useEffect(() => {
    if (allSpots.length > 0 || !geocodingLib || !map) return;
    const geocoder = new geocodingLib.Geocoder();
    geocoder.geocode({ address: trip.destination }, (results, status) => {
      if (status === "OK" && results?.[0]) {
        const loc = results[0].geometry.location;
        map.panTo({ lat: loc.lat(), lng: loc.lng() });
        map.setZoom(12);
      }
    });
  // trip.destination は旅行作成後に変わらないため、初回のみ実行
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [geocodingLib, map]);

  // ── 文化財ステート ──────────────────────────────────────────────────
  const [culturalProperties, setCulturalProperties] = useState<CulturalProperty[]>([]);
  const [currentZoom, setCurrentZoom] = useState(12);
  const [activeCluster, setActiveCluster] = useState<CulturalPropertyCluster | null>(null);
  const [legendCollapsed, setLegendCollapsed] = useState(false);

  // POI click hook に渡す ref（callback 再生成を抑制）
  // useEffect 経由だと 1 レンダリング遅れるため、レンダー中に直接代入して常に最新値を参照する
  const culturalPropertiesRef = useRef<CulturalProperty[]>([]);
  culturalPropertiesRef.current = culturalProperties;

  const boundsTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (boundsTimerRef.current) clearTimeout(boundsTimerRef.current); }, []);

  // カテゴリフィルター適用後の文化財
  const filteredCulturalProperties = useMemo(
    () => culturalProperties.filter((cp) => enabledCategories.includes(cp.category)),
    [culturalProperties, enabledCategories]
  );

  // クラスタ計算（culturalProperties または zoom が変わったときだけ再計算）
  const clusters = useMemo(
    () => clusterCulturalProperties(filteredCulturalProperties, currentZoom),
    [filteredCulturalProperties, currentZoom]
  );

  // ── フェッチ ────────────────────────────────────────────────────────
  const fetchCulturalProperties = useCallback(
    async (bounds: { north: number; south: number; east: number; west: number }) => {
      const params = new URLSearchParams({
        north: bounds.north.toString(),
        south: bounds.south.toString(),
        east: bounds.east.toString(),
        west: bounds.west.toString(),
      });
      try {
        const res = await fetch(`/api/cultural-properties?${params}`);
        if (!res.ok) {
          const body = await res.text();
          throw new Error(`HTTP ${res.status}: ${body}`);
        }
        const data: CulturalProperty[] = await res.json();
        setCulturalProperties(data);
      } catch (err) {
        console.error("[TripMap] cultural-properties fetch failed:", err);
      }
    },
    []
  );

  // 文化財OFF時はデータをクリア
  useEffect(() => {
    if (!showCulturalProperties) {
      setCulturalProperties([]);
      setActiveCluster(null);
    }
  }, [showCulturalProperties]);

  // ── カメラ変化ハンドラ ────────────────────────────────────────────
  const handleBoundsChanged = useCallback(
    (e: MapCameraChangedEvent) => {
      const zoom = e.detail.zoom;
      // クラスタは整数ズームレベルで再計算（アニメーション中の過剰な再計算を防ぐ）
      setCurrentZoom((prev) => {
        const intZoom = Math.floor(zoom);
        return prev !== intZoom ? intZoom : prev;
      });

      if (!showCulturalProperties || zoom < MIN_ZOOM_FOR_CULTURAL) {
        if (boundsTimerRef.current) clearTimeout(boundsTimerRef.current);
        setCulturalProperties([]);
        setActiveCluster(null);
        return;
      }

      const { north, south, east, west } = e.detail.bounds;
      if (boundsTimerRef.current) clearTimeout(boundsTimerRef.current);
      boundsTimerRef.current = setTimeout(() => {
        fetchCulturalProperties({ north, south, east, west });
      }, BOUNDS_DEBOUNCE_MS);
    },
    [fetchCulturalProperties, showCulturalProperties]
  );

  // ── ハンドラ ────────────────────────────────────────────────────────
  const handlePOIClick = usePOIClick(onPendingSpot, culturalPropertiesRef);

  const handleCulturalPropertyClick = useCallback(
    (cp: CulturalProperty) => {
      setActiveCluster(null);
      onPendingSpot(culturalPropertyToPendingSpot(cp));
    },
    [onPendingSpot]
  );

  return (
    <div className="relative h-full w-full">
      <Map
        mapId="travel-planner-map"
        defaultCenter={center}
        defaultZoom={12}
        gestureHandling="greedy"
        onClick={handlePOIClick}
        onBoundsChanged={handleBoundsChanged}
        className="h-full w-full"
      >
        <RouteLayer
          trip={trip}
          selectedDayIndex={selectedDayIndex}
          legsByDay={legsByDay}
        />

        {/* ── 旅行スポットマーカー ── */}
        {trip.days.map((day, dayIdx) => {
          const color = getDayColor(dayIdx);
          return day.spots.map((spot) => {
            const isSelected =
              selectedSpotId === spot.id && selectedDayId === day.id;
            return (
              <AdvancedMarker
                key={spot.id}
                position={{ lat: spot.lat, lng: spot.lng }}
                onClick={() => onSelectSpot(day.id, spot.id)}
              >
                <Pin
                  background={color}
                  borderColor={isSelected ? "#1d4ed8" : color}
                  glyphColor="#fff"
                  scale={isSelected ? 1.3 : 1}
                />
                {isSelected && (
                  <InfoWindow
                    position={{ lat: spot.lat, lng: spot.lng }}
                    onCloseClick={() => {}}
                  >
                    <div className="max-w-[180px] text-sm">
                      <p className="font-semibold text-gray-800">{spot.name}</p>
                      <p className="mt-0.5 text-xs text-gray-500">{spot.address}</p>
                    </div>
                  </InfoWindow>
                )}
              </AdvancedMarker>
            );
          });
        })}

        {/* ── 文化財クラスタマーカー ── */}
        {clusters.map((cluster) => (
          <AdvancedMarker
            key={cluster.key}
            position={{ lat: cluster.lat, lng: cluster.lng }}
            title={
              cluster.items.length === 1
                ? `${cluster.items[0].category}：${cluster.items[0].name}`
                : `文化財 ${cluster.items.length} 件`
            }
            onClick={() => setActiveCluster(cluster)}
            zIndex={activeCluster?.key === cluster.key ? 10 : 1}
          >
            {cluster.items.length === 1 ? (
              <CulturalMarkerPin category={cluster.topCategory} />
            ) : (
              <ClusterPin count={cluster.items.length} topCategory={cluster.topCategory} />
            )}
          </AdvancedMarker>
        ))}

        {/* ── クラスタ InfoWindow ── */}
        {activeCluster && (
          <InfoWindow
            position={{ lat: activeCluster.lat, lng: activeCluster.lng }}
            onCloseClick={() => setActiveCluster(null)}
          >
            {activeCluster.items.length === 1 ? (
              <SingleCPContent
                cp={activeCluster.items[0]}
                onAdd={handleCulturalPropertyClick}
              />
            ) : (
              <ClusterContent
                cluster={activeCluster}
                onAdd={(cp) => {
                  handleCulturalPropertyClick(cp);
                }}
              />
            )}
          </InfoWindow>
        )}
      </Map>

      {/* 凡例（文化財表示中のみ） */}
      {filteredCulturalProperties.length > 0 && (
        <div className="absolute bottom-8 right-2 z-10 rounded-xl bg-white/90 shadow-md ring-1 ring-gray-200 backdrop-blur-sm overflow-hidden">
          <button
            onClick={() => setLegendCollapsed((v) => !v)}
            className="flex w-full items-center justify-between gap-3 px-3 py-2 hover:bg-gray-100/60 transition"
          >
            <p className="text-[10px] font-semibold text-gray-500">文化財</p>
            <svg
              className={`h-3 w-3 text-gray-400 transition-transform ${legendCollapsed ? "rotate-180" : ""}`}
              fill="none"
              stroke="currentColor"
              strokeWidth={2.5}
              viewBox="0 0 12 12"
            >
              <polyline points="2,4 6,8 10,4" />
            </svg>
          </button>
          {!legendCollapsed && (
            <div className="px-3 pb-2">
              {(Object.entries(CATEGORY_COLOR) as [CulturalPropertyCategory, string][]).map(
                ([cat, color]) => (
                  <div key={cat} className="flex items-center gap-1.5 text-[11px] text-gray-700">
                    <span
                      className="inline-block h-3 w-3 shrink-0 rounded-full"
                      style={{ background: color }}
                    />
                    {cat}
                  </div>
                )
              )}
            </div>
          )}
        </div>
      )}

      {/* Overlay children (PendingSpotCard) */}
      {children}
    </div>
  );
}

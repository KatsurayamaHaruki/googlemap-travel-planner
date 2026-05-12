"use client";
import { useEffect, useRef, useCallback } from "react";
import {
  Map,
  AdvancedMarker,
  Pin,
  useMap,
  InfoWindow,
  useMapsLibrary,
  type MapMouseEvent,
} from "@vis.gl/react-google-maps";
import type { Trip } from "@/types";
import type { PendingSpot } from "@/components/PendingSpotCard";
import { getDayColor } from "@/lib/utils";
import { extractOpeningHoursFromPlace } from "@/lib/openingHours";
import type { RouteLeg } from "@/hooks/useDirections";

// ---------------------------------------------------------------------------
// Route layer – renders Directions API polylines for all days
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
        // Render actual route polylines from Directions API
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
        // Fallback: straight lines when no directions result yet
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
// POI click handler hook
// ---------------------------------------------------------------------------
function usePOIClick(
  onPendingSpot: (spot: PendingSpot) => void
) {
  const placesLib = useMapsLibrary("places");

  return useCallback(
    (e: MapMouseEvent) => {
      const placeId = (e as unknown as { detail?: { placeId?: string } }).detail?.placeId;
      if (!placeId || !placesLib) return;

      // Prevent native info window
      (e as unknown as { stop?: () => void }).stop?.();

      const place = new placesLib.Place({ id: placeId });
      place
        .fetchFields({
          fields: ["displayName", "location", "formattedAddress", "regularOpeningHours", "photos", "websiteURI"],
        })
        .then(() => {
          if (!place.location) return;
          const photos = (place.photos ?? [])
            .slice(0, 3)
            .map((p) => p.getURI({ maxWidth: 800 }))
            .filter(Boolean) as string[];
          onPendingSpot({
            name: place.displayName ?? "",
            lat: place.location.lat(),
            lng: place.location.lng(),
            address: place.formattedAddress ?? "",
            placeId,
            website: (place as unknown as { websiteURI?: string }).websiteURI ?? undefined,
            photos,
            openingHours: place.regularOpeningHours
              ? extractOpeningHoursFromPlace(place.regularOpeningHours)
              : undefined,
          });
        })
        .catch(() => {});
    },
    [placesLib, onPendingSpot]
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

  const handlePOIClick = usePOIClick(onPendingSpot);

  return (
    <div className="relative h-full w-full">
      <Map
        mapId="travel-planner-map"
        defaultCenter={center}
        defaultZoom={12}
        gestureHandling="greedy"
        onClick={handlePOIClick}
        className="h-full w-full"
      >
        <RouteLayer
          trip={trip}
          selectedDayIndex={selectedDayIndex}
          legsByDay={legsByDay}
        />

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
      </Map>

      {/* Overlay children (PendingSpotCard) */}
      {children}
    </div>
  );
}

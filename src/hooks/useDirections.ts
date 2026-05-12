"use client";
import { useState, useEffect, useRef } from "react";
import { useMapsLibrary } from "@vis.gl/react-google-maps";
import type { Day, TravelMode } from "@/types";

export interface TransitStep {
  duration: string;
  lineName?: string;
  lineShortName?: string;
  vehicleType?: string;
  departureStop?: string;
  arrivalStop?: string;
  departureTime?: string;
  arrivalTime?: string;
  numStops?: number;
}

export interface RouteLeg {
  duration: string;
  distance: string;
  transitSteps: TransitStep[];
  overviewPath: google.maps.LatLng[];
}

function formatDurationMs(ms: number): string {
  const totalMin = Math.round(ms / 60000);
  if (totalMin < 60) return `${totalMin}分`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m > 0 ? `${h}時間${m}分` : `${h}時間`;
}

function formatDistance(meters: number): string {
  return meters < 1000 ? `${meters}m` : `${(meters / 1000).toFixed(1)}km`;
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

// Pure-JS encoded polyline decoder
function decodePolyline(encoded: string): google.maps.LatLng[] {
  const points: google.maps.LatLng[] = [];
  let index = 0, lat = 0, lng = 0;
  while (index < encoded.length) {
    let result = 0, shift = 0, b: number;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lat += (result & 1) ? ~(result >> 1) : result >> 1;
    result = 0; shift = 0;
    do { b = encoded.charCodeAt(index++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
    lng += (result & 1) ? ~(result >> 1) : result >> 1;
    points.push(new google.maps.LatLng(lat / 1e5, lng / 1e5));
  }
  return points;
}

export function useDirections(
  day: Day | undefined,
  travelMode: TravelMode,
  enabled: boolean
): RouteLeg[] {
  const routesLib = useMapsLibrary("routes");
  const [legs, setLegs] = useState<RouteLeg[]>([]);

  useEffect(() => {
    if (!routesLib || !day || !enabled || day.spots.length < 2) {
      setLegs([]);
      return;
    }

    const controller = new AbortController();
    const { signal } = controller;
    const isTransit = travelMode === "TRANSIT";
    const sortedSpots = day.spots.slice().sort((a, b) => a.order - b.order);

    Promise.all(
      sortedSpots.slice(0, -1).map((spot, i) => {
        const nextSpot = sortedSpots[i + 1];

        if (isTransit) {
          // Use Routes API v2 REST directly (JS SDK does not support TRANSIT travelMode)
          const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY!;
          const departureTime = new Date(Date.now() + 5 * 60_000);

          return fetch(
            `https://routes.googleapis.com/directions/v2:computeRoutes?key=${apiKey}`,
            {
              method: "POST",
              signal,
              headers: {
                "Content-Type": "application/json",
                "X-Goog-FieldMask": "routes.legs.duration,routes.legs.distanceMeters,routes.legs.polyline",
              },
              body: JSON.stringify({
                origin: { location: { latLng: { latitude: spot.lat, longitude: spot.lng } } },
                destination: { location: { latLng: { latitude: nextSpot.lat, longitude: nextSpot.lng } } },
                travelMode: "TRANSIT",
                computeAlternativeRoutes: false,
                departureTime: departureTime.toISOString(),
              }),
            }
          )
            .then((r) => r.json())
            .then((data) => {
              const leg = data.routes?.[0]?.legs?.[0];
              if (!leg) return null;
              const overviewPath = leg.polyline?.encodedPolyline
                ? decodePolyline(leg.polyline.encodedPolyline)
                : [];
              return {
                duration: leg.duration ? formatDurationMs(parseFloat(leg.duration) * 1000) : "",
                distance: leg.distanceMeters ? formatDistance(leg.distanceMeters) : "",
                transitSteps: [],
                overviewPath,
              } satisfies RouteLeg;
            })
            .catch((err: unknown) => {
              if (err instanceof Error && err.name === "AbortError") return null;
              return null;
            });
        }

        return routesLib.Route.computeRoutes({
          origin: { lat: spot.lat, lng: spot.lng },
          destination: { lat: nextSpot.lat, lng: nextSpot.lng },
          travelMode: travelMode as google.maps.TravelModeString,
          language: "ja",
          fields: ["durationMillis", "distanceMeters", "path"],
        })
          .then(({ routes }) => {
            if (signal.aborted) return null;
            const route = (routes?.[0]) as Record<string, unknown> | undefined;
            if (!route) return null;

            const overviewPath = ((route.path ?? []) as { lat: number; lng: number }[])
              .map((p) => new google.maps.LatLng(p.lat, p.lng));

            const transitSteps: TransitStep[] = [];

            return {
              duration: (route.durationMillis as number | undefined) ? formatDurationMs(route.durationMillis as number) : "",
              distance: (route.distanceMeters as number | undefined) ? formatDistance(route.distanceMeters as number) : "",
              transitSteps,
              overviewPath,
            } satisfies RouteLeg;
          })
          .catch(() => null);
      })
    ).then((results) => {
      if (!signal.aborted) {
        setLegs(results.filter((r): r is RouteLeg => r !== null));
      }
    });

    return () => {
      controller.abort();
    };
  }, [routesLib, day, travelMode, enabled]);

  return legs;
}

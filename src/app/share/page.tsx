"use client";
import { useSearchParams, useRouter } from "next/navigation";
import { Suspense } from "react";
import { APIProvider } from "@vis.gl/react-google-maps";
import { MapPin, Calendar, ArrowLeft } from "lucide-react";
import { decodeShareData, formatDate, getDayColor } from "@/lib/utils";
import { TripMap } from "@/components/TripMap";

const API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

function ShareContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const encoded = searchParams.get("data");
  const trip = encoded ? decodeShareData(encoded) : null;

  if (!trip) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <MapPin className="mx-auto mb-3 text-gray-300" size={40} />
          <p className="text-gray-500">共有データが無効です</p>
          <button onClick={() => router.push("/")} className="mt-4 text-sm text-blue-600 hover:underline">
            トップへ戻る
          </button>
        </div>
      </div>
    );
  }

  return (
    <APIProvider apiKey={API_KEY}>
      <div className="flex h-screen flex-col">
        <header className="flex items-center gap-3 border-b border-gray-200 bg-white px-4 py-3">
          <button onClick={() => router.push("/")} className="rounded-lg p-1.5 hover:bg-gray-100">
            <ArrowLeft size={18} className="text-gray-600" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate font-bold text-gray-800">{trip.title}</h1>
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700">共有</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-gray-500">
              <Calendar size={11} />
              <span>{formatDate(trip.startDate)} 〜 {formatDate(trip.endDate)}</span>
            </div>
          </div>
        </header>

        <div className="flex flex-1 overflow-hidden">
          {/* Itinerary (read-only) */}
          <div className="w-72 shrink-0 overflow-y-auto border-r border-gray-200 bg-white p-4">
            {trip.days.map((day, i) => (
              <div key={day.id} className="mb-4">
                <div className="mb-2 flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full" style={{ backgroundColor: getDayColor(i) }} />
                  <span className="text-sm font-semibold text-gray-700">
                    Day {i + 1} · {formatDate(day.date)}
                  </span>
                </div>
                <div className="ml-4 space-y-1 border-l-2 pl-3" style={{ borderColor: getDayColor(i) + "50" }}>
                  {day.spots.length === 0 ? (
                    <p className="text-xs text-gray-400">スポットなし</p>
                  ) : (
                    day.spots.map((spot) => (
                      <div key={spot.id} className="py-1">
                        <p className="text-sm font-medium text-gray-800">{spot.name}</p>
                        {spot.startTime && (
                          <p className="text-xs text-gray-400">{spot.startTime}{spot.duration ? ` (${spot.duration}分)` : ""}</p>
                        )}
                        {spot.memo && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{spot.memo}</p>}
                      </div>
                    ))
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Map */}
          <div className="flex-1">
            <TripMap
              trip={trip}
              selectedSpotId={null}
              selectedDayId={null}
              legsByDay={new Map()}
              onSelectSpot={() => {}}
              onPendingSpot={() => {}}
            />
          </div>
        </div>
      </div>
    </APIProvider>
  );
}

export default function SharePage() {
  return (
    <Suspense fallback={<div className="flex h-screen items-center justify-center text-gray-400">読み込み中...</div>}>
      <ShareContent />
    </Suspense>
  );
}

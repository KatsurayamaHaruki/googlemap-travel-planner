"use client";
import { useState, useCallback, useRef } from "react";
import { X, Search, MapPin, ExternalLink } from "lucide-react";
import { useMapsLibrary } from "@vis.gl/react-google-maps";
import { extractOpeningHoursFromPlace } from "@/lib/openingHours";
import type { OpeningHours } from "@/types";

export interface PlaceResult {
  name: string;
  lat: number;
  lng: number;
  address: string;
  placeId: string;
  website?: string;
  photos: string[];
  openingHours?: OpeningHours;
}

interface Props {
  onClose: () => void;
  onSelect: (place: PlaceResult) => void;
}

export function SpotSearchModal({ onClose, onSelect }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [loading, setLoading] = useState(false);
  const placesLib = useMapsLibrary("places");
  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);

  const search = useCallback(async () => {
    if (!query.trim() || !placesLib) return;
    setLoading(true);
    try {
      if (!sessionTokenRef.current) {
        sessionTokenRef.current = new placesLib.AutocompleteSessionToken();
      }

      const { suggestions } =
        await placesLib.AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: query,
          language: "ja",
          sessionToken: sessionTokenRef.current,
        });

      const details = await Promise.all(
        suggestions.slice(0, 5).map(async (suggestion) => {
          const pred = suggestion.placePrediction;
          if (!pred) return null;
          const place = pred.toPlace();
          try {
            await place.fetchFields({
              fields: ["displayName", "location", "formattedAddress", "regularOpeningHours", "photos", "websiteURI"],
            });
          } catch {
            return null;
          }
          if (!place.location) return null;

          const photos = (place.photos ?? [])
            .slice(0, 3)
            .map((p) => p.getURI({ maxWidth: 800 }))
            .filter(Boolean) as string[];

          const result: PlaceResult = {
            name: place.displayName ?? pred.mainText?.text ?? "",
            lat: place.location.lat(),
            lng: place.location.lng(),
            address: place.formattedAddress ?? pred.secondaryText?.text ?? "",
            placeId: place.id,
            website: (place as unknown as { websiteURI?: string }).websiteURI ?? undefined,
            photos,
            openingHours: place.regularOpeningHours
              ? extractOpeningHoursFromPlace(place.regularOpeningHours)
              : undefined,
          };
          return result;
        })
      );

      setResults(details.filter((d): d is PlaceResult => d !== null));
      sessionTokenRef.current = null;
    } finally {
      setLoading(false);
    }
  }, [query, placesLib]);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-16">
      <div className="relative w-full max-w-lg rounded-2xl bg-white shadow-xl">
        <div className="flex items-center gap-3 border-b border-gray-200 px-4 py-3">
          <Search size={18} className="text-gray-400" />
          <input
            autoFocus
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
            placeholder="スポットを検索..."
            className="flex-1 text-sm focus:outline-none"
          />
          {loading && (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent" />
          )}
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        <div className="px-4 py-2">
          <button
            onClick={search}
            disabled={!query.trim() || loading}
            className="w-full rounded-lg bg-blue-600 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40"
          >
            検索
          </button>
        </div>

        {results.length > 0 && (
          <ul className="max-h-80 overflow-y-auto divide-y divide-gray-100">
            {results.map((r) => (
              <li key={r.placeId}>
                <button
                  onClick={() => { onSelect(r); onClose(); }}
                  className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-gray-50"
                >
                  {r.photos[0] ? (
                    <img src={r.photos[0]} alt="" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
                  ) : (
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-gray-100">
                      <MapPin size={16} className="text-blue-500" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800">{r.name}</p>
                    <p className="text-xs text-gray-500 line-clamp-1">{r.address}</p>
                    {r.website && (
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-blue-500 truncate">
                        <ExternalLink size={10} />
                        {r.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                      </p>
                    )}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}

        {results.length === 0 && !loading && query && (
          <p className="px-4 py-6 text-center text-sm text-gray-400">「検索」ボタンを押してください</p>
        )}
      </div>
    </div>
  );
}

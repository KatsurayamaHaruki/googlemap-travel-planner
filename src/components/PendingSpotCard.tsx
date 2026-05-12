"use client";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, X, MapPin, Plus, ExternalLink, Bookmark } from "lucide-react";
import type { Trip, OpeningHours, CulturalPropertyCategory } from "@/types";
import { formatDate } from "@/lib/utils";
import { CATEGORY_COLOR } from "@/lib/cultural-properties";

export interface PendingSpot {
  name: string;
  lat: number;
  lng: number;
  address: string;
  placeId?: string; // Google Places ID。文化財など外部データでは省略可
  website?: string;
  photos: string[];
  openingHours?: OpeningHours;
  // 文化財マーカーまたは Google POI 近傍マッチ時にセット
  culturalCategory?: CulturalPropertyCategory;
  culturalCategories?: CulturalPropertyCategory[];
}

interface Props {
  spot: PendingSpot;
  trip: Trip;
  onAddToDay: (dayId: string) => void;
  onAddToCandidate: () => void;
  onClose: () => void;
}

export function PendingSpotCard({ spot, trip, onAddToDay, onAddToCandidate, onClose }: Props) {
  const { attributes, listeners, setNodeRef, transform, isDragging } =
    useDraggable({ id: "pending-spot" });

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.3 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="absolute left-3 top-3 z-20 w-72 rounded-2xl bg-white shadow-xl ring-1 ring-gray-200"
    >
      {/* Photo */}
      {spot.photos[0] && (
        <div className="relative h-32 w-full overflow-hidden rounded-t-2xl">
          <img src={spot.photos[0]} alt={spot.name} className="h-full w-full object-cover" />
        </div>
      )}

      {/* Header with drag handle */}
      <div className="flex items-center gap-2 border-b border-gray-100 px-3 py-2.5">
        <div
          {...listeners}
          {...attributes}
          className="cursor-grab text-gray-300 hover:text-gray-500 active:cursor-grabbing"
          title="ドラッグして日程に追加"
        >
          <GripVertical size={16} />
        </div>
        <MapPin size={14} className="shrink-0 text-blue-500" />
        <span className="flex-1 truncate text-sm font-semibold text-gray-800">
          {spot.name}
        </span>
        <button
          onClick={onClose}
          className="rounded-lg p-0.5 text-gray-300 hover:text-gray-600"
        >
          <X size={14} />
        </button>
      </div>

      {/* Address */}
      <p className="px-3 pt-1.5 text-xs text-gray-500 line-clamp-2">{spot.address}</p>

      {/* 文化財バッジ */}
      {spot.culturalCategory && (
        <div className="px-3 pt-1">
          <span
            className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold text-white"
            style={{ background: CATEGORY_COLOR[spot.culturalCategory] }}
          >
            {spot.culturalCategories && spot.culturalCategories.length > 1
              ? spot.culturalCategories.join(" ／ ")
              : spot.culturalCategory}
          </span>
        </div>
      )}

      {/* Website */}
      {spot.website && (
        <a
          href={spot.website}
          target="_blank"
          rel="noopener noreferrer"
          className="mx-3 mt-1 flex items-center gap-1 text-xs text-blue-500 hover:underline truncate"
          onClick={(e) => e.stopPropagation()}
        >
          <ExternalLink size={10} />
          {spot.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
        </a>
      )}

      {/* Opening hours */}
      {spot.openingHours?.weekdayText && spot.openingHours.weekdayText.length > 0 && (
        <p className="px-3 pb-1 mt-1 text-xs text-gray-400 line-clamp-1">
          {spot.openingHours.weekdayText[new Date().getDay() === 0 ? 6 : new Date().getDay() - 1]}
        </p>
      )}

      {/* Actions */}
      <div className="border-t border-gray-100 p-2.5 space-y-2">
        {/* Candidate button */}
        <button
          onClick={onAddToCandidate}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-gray-200 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
        >
          <Bookmark size={11} />
          候補リストに保存
        </button>

        {/* Day buttons */}
        <div>
          <p className="mb-1.5 text-xs font-medium text-gray-500">日程に追加:</p>
          <div className="flex flex-wrap gap-1.5">
            {trip.days.map((day, i) => (
              <button
                key={day.id}
                onClick={() => onAddToDay(day.id)}
                className="flex items-center gap-1 rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100"
              >
                <Plus size={10} />
                Day {i + 1}
                <span className="text-blue-400">({formatDate(day.date)})</span>
              </button>
            ))}
          </div>
          <p className="mt-1.5 flex items-center gap-1 text-xs text-gray-400">
            <GripVertical size={10} />
            またはドラッグして追加
          </p>
        </div>
      </div>
    </div>
  );
}

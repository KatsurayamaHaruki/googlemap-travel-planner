"use client";
import { MapPin, Plus, Trash2, ExternalLink, Bookmark } from "lucide-react";
import type { Trip, CandidateSpot } from "@/types";
import { formatDate } from "@/lib/utils";

interface Props {
  trip: Trip;
  onPromote: (dayId: string, candidateId: string) => void;
  onRemove: (candidateId: string) => void;
}

export function CandidatePanel({ trip, onPromote, onRemove }: Props) {
  const candidates = trip.candidates ?? [];

  if (candidates.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 px-4 text-center text-gray-400">
        <Bookmark size={32} className="mb-3 text-gray-200" />
        <p className="text-sm font-medium text-gray-500">候補リストは空です</p>
        <p className="mt-1 text-xs">地図上のスポットをクリックして「候補リストに保存」してください</p>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-3 space-y-2">
      {candidates.map((c) => (
        <CandidateCard
          key={c.id}
          candidate={c}
          trip={trip}
          onPromote={(dayId) => onPromote(dayId, c.id)}
          onRemove={() => onRemove(c.id)}
        />
      ))}
    </div>
  );
}

interface CardProps {
  candidate: CandidateSpot;
  trip: Trip;
  onPromote: (dayId: string) => void;
  onRemove: () => void;
}

function CandidateCard({ candidate, trip, onPromote, onRemove }: CardProps) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white shadow-sm overflow-hidden">
      {/* Photo */}
      {candidate.photos[0] && (
        <div className="h-28 w-full overflow-hidden">
          <img src={candidate.photos[0]} alt={candidate.name} className="h-full w-full object-cover" />
        </div>
      )}

      <div className="p-3">
        {/* Name + remove */}
        <div className="flex items-start gap-2">
          <MapPin size={13} className="mt-0.5 shrink-0 text-blue-500" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-gray-800 truncate">{candidate.name}</p>
            <p className="text-xs text-gray-400 line-clamp-1">{candidate.address}</p>
          </div>
          <button
            onClick={onRemove}
            className="shrink-0 rounded-lg p-1 text-gray-300 hover:bg-red-50 hover:text-red-400"
          >
            <Trash2 size={13} />
          </button>
        </div>

        {/* Website */}
        {candidate.website && (
          <a
            href={candidate.website}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-1.5 flex items-center gap-1 text-xs text-blue-500 hover:underline truncate"
          >
            <ExternalLink size={10} />
            {candidate.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
          </a>
        )}

        {/* Promote buttons */}
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {trip.days.map((day, i) => (
            <button
              key={day.id}
              onClick={() => onPromote(day.id)}
              className="flex items-center gap-1 rounded-lg bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 hover:bg-blue-100"
            >
              <Plus size={10} />
              Day {i + 1}
              <span className="text-blue-400 text-[10px]">({formatDate(day.date)})</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

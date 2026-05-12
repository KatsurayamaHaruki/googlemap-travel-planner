"use client";
import { useState } from "react";
import { useDraggable } from "@dnd-kit/core";
import { CSS } from "@dnd-kit/utilities";
import {
  GripVertical, X, Plus, ExternalLink, Bookmark, Star,
  ChevronDown, ChevronUp, MapPin, Copy, Check, Clock,
  Phone, Car,
} from "lucide-react";
import type { Trip, OpeningHours, CulturalPropertyCategory } from "@/types";
import { formatDate } from "@/lib/utils";
import { CATEGORY_COLOR } from "@/lib/cultural-properties";

function GoogleMapsIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z" fill="#EA4335" />
      <circle cx="12" cy="9" r="2.8" fill="white" />
    </svg>
  );
}

// 価格帯
const PRICE_LEVEL: Record<string, string> = {
  PRICE_LEVEL_FREE:        "無料",
  PRICE_LEVEL_INEXPENSIVE: "¥",
  PRICE_LEVEL_MODERATE:    "¥¥",
  PRICE_LEVEL_EXPENSIVE:   "¥¥¥",
  PRICE_LEVEL_VERY_EXPENSIVE: "¥¥¥¥",
};

// primaryType の日本語マッピング（主要なもの）
const PRIMARY_TYPE: Record<string, string> = {
  restaurant: "レストラン", cafe: "カフェ", bar: "バー",
  bakery: "ベーカリー", meal_takeaway: "テイクアウト",
  museum: "博物館・美術館", art_gallery: "ギャラリー",
  park: "公園", amusement_park: "遊園地", zoo: "動物園",
  aquarium: "水族館", botanical_garden: "植物園",
  shrine: "神社", temple: "寺院", church: "教会",
  tourist_attraction: "観光スポット", landmark: "ランドマーク",
  historical_landmark: "史跡・旧跡",
  lodging: "宿泊施設", hotel: "ホテル", ryokan: "旅館",
  shopping_mall: "ショッピングモール", supermarket: "スーパー",
  convenience_store: "コンビニ", department_store: "百貨店",
  train_station: "駅", bus_station: "バス停",
  airport: "空港", parking: "駐車場",
  hospital: "病院", pharmacy: "薬局",
  spa: "スパ", beauty_salon: "美容院",
  night_club: "ナイトクラブ", movie_theater: "映画館",
};

// 駐車場オプションを日本語リストに変換
function parseParkingOptions(opts: Record<string, boolean>): string[] {
  const map: [string, string][] = [
    ["freeParkingLot",    "無料駐車場"],
    ["paidParkingLot",    "有料駐車場"],
    ["freeStreetParking", "無料路上駐車"],
    ["paidStreetParking", "有料路上駐車"],
    ["valetParking",      "バレーパーキング"],
    ["freeGarage",        "無料立体駐車場"],
    ["paidGarage",        "有料立体駐車場"],
  ];
  return map.filter(([key]) => opts[key]).map(([, label]) => label);
}

// Google の weekdayText は月〜日順（index 0=月, 6=日）
const WEEKDAY_SHORT = ["月", "火", "水", "木", "金", "土", "日"];
function getTodayIdx() {
  const d = new Date().getDay();
  return d === 0 ? 6 : d - 1;
}

export interface PendingSpot {
  name: string;
  lat: number;
  lng: number;
  address: string;
  placeId?: string;
  website?: string;
  photos: string[];
  openingHours?: OpeningHours;
  rating?: number;
  userRatingCount?: number;
  editorialSummary?: string;
  priceLevel?: string;
  phoneNumber?: string;
  primaryType?: string;
  parkingOptions?: Record<string, boolean>;
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
  const [showDetail, setShowDetail] = useState(false);
  const [copied, setCopied] = useState(false);

  const style = {
    transform: CSS.Translate.toString(transform),
    opacity: isDragging ? 0.3 : 1,
  };

  const todayIdx = getTodayIdx();
  const todayText = spot.openingHours?.weekdayText?.[todayIdx];
  const priceLabelText = spot.priceLevel ? PRICE_LEVEL[spot.priceLevel] : undefined;
  const primaryTypeText = spot.primaryType
    ? (PRIMARY_TYPE[spot.primaryType] ?? spot.primaryType.replace(/_/g, " "))
    : undefined;
  const parkingList = spot.parkingOptions ? parseParkingOptions(spot.parkingOptions) : [];

  const googleMapsUrl =
    spot.placeId && !spot.placeId.startsWith("wikidata:")
      ? `https://www.google.com/maps/place/?q=place_id:${spot.placeId}`
      : `https://www.google.com/maps?q=${spot.lat},${spot.lng}`;

  function copyAddress() {
    navigator.clipboard.writeText(spot.address).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="absolute z-20 rounded-2xl bg-white shadow-xl ring-1 ring-gray-200 left-2 right-2 top-2 md:left-3 md:top-3 md:right-auto md:w-72"
    >
      {/* Photo */}
      {spot.photos[0] && (
        <div className="relative h-32 w-full overflow-hidden rounded-t-2xl">
          <img src={spot.photos[0]} alt={spot.name} className="h-full w-full object-cover" />
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-2 border-b border-gray-100 px-3 py-2.5">
        <div
          {...listeners}
          {...attributes}
          className="cursor-grab text-gray-300 hover:text-gray-500 active:cursor-grabbing"
          title="ドラッグして日程に追加"
        >
          <GripVertical size={16} />
        </div>
        <a
          href={googleMapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          title="Google Maps で開く"
          onClick={(e) => e.stopPropagation()}
          className="shrink-0 hover:opacity-70 transition-opacity"
        >
          <GoogleMapsIcon size={18} />
        </a>
        <span className="flex-1 truncate text-sm font-semibold text-gray-800">{spot.name}</span>
        <button onClick={onClose} className="rounded-lg p-0.5 text-gray-300 hover:text-gray-600">
          <X size={14} />
        </button>
      </div>

      {/* Summary */}
      <div className="px-3 pt-1.5 pb-1 space-y-1">
        {/* カテゴリ・価格帯 行 */}
        {(primaryTypeText || priceLabelText) && (
          <div className="flex items-center gap-2 flex-wrap">
            {primaryTypeText && (
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-600">
                {primaryTypeText}
              </span>
            )}
            {priceLabelText && (
              <span className="rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-semibold text-green-700">
                {priceLabelText}
              </span>
            )}
          </div>
        )}

        {/* 評価 */}
        {spot.rating != null && (
          <div className="flex items-center gap-1.5">
            <Star size={11} className="text-amber-400 fill-amber-400" />
            <span className="text-xs font-semibold text-gray-700">{spot.rating.toFixed(1)}</span>
            {spot.userRatingCount != null && (
              <span className="text-xs text-gray-400">({spot.userRatingCount.toLocaleString()}件)</span>
            )}
          </div>
        )}

        {/* 概要 */}
        {spot.editorialSummary && (
          <p className="text-xs text-gray-500 line-clamp-2">{spot.editorialSummary}</p>
        )}

        {/* 文化財バッジ */}
        {spot.culturalCategory && (
          <span
            className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold text-white"
            style={{ background: CATEGORY_COLOR[spot.culturalCategory] }}
          >
            {spot.culturalCategories && spot.culturalCategories.length > 1
              ? spot.culturalCategories.join(" ／ ")
              : spot.culturalCategory}
          </span>
        )}

        {/* ウェブサイト */}
        {spot.website && (
          <a
            href={spot.website}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-blue-500 hover:underline truncate"
            onClick={(e) => e.stopPropagation()}
          >
            <ExternalLink size={10} />
            {spot.website.replace(/^https?:\/\//, "").replace(/\/$/, "")}
          </a>
        )}

        {/* 今日の営業時間 */}
        {todayText && (
          <div className="flex items-center gap-1 text-xs text-gray-400">
            <Clock size={10} className="shrink-0" />
            <span className="line-clamp-1">{todayText}</span>
          </div>
        )}
      </div>

      {/* 詳細トグル */}
      <button
        onClick={() => setShowDetail((v) => !v)}
        className="flex w-full items-center justify-center gap-1 border-t border-gray-100 py-1.5 text-xs text-gray-400 hover:bg-gray-50 hover:text-gray-600 transition"
      >
        {showDetail
          ? <><ChevronUp size={12} />詳細を閉じる</>
          : <><ChevronDown size={12} />詳細を見る</>}
      </button>

      {/* 詳細パネル */}
      {showDetail && (
        <div className="border-t border-gray-100 px-3 py-2.5 space-y-3 bg-gray-50">
          {/* 住所 */}
          <div>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">住所</p>
            <div className="flex items-start gap-1.5">
              <MapPin size={11} className="mt-0.5 shrink-0 text-gray-400" />
              <p className="flex-1 text-xs text-gray-700 leading-relaxed">{spot.address}</p>
              <button
                onClick={copyAddress}
                title="住所をコピー"
                className="shrink-0 rounded p-0.5 text-gray-300 hover:text-blue-500 transition"
              >
                {copied
                  ? <Check size={12} className="text-green-500" />
                  : <Copy size={12} />}
              </button>
            </div>
          </div>

          {/* 電話番号 */}
          {spot.phoneNumber && (
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">電話番号</p>
              <a
                href={`tel:${spot.phoneNumber}`}
                className="flex items-center gap-1.5 text-xs text-blue-600 hover:underline"
                onClick={(e) => e.stopPropagation()}
              >
                <Phone size={11} className="shrink-0" />
                {spot.phoneNumber}
              </a>
            </div>
          )}

          {/* 駐車場 */}
          {parkingList.length > 0 && (
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">駐車場</p>
              <div className="flex flex-wrap gap-1">
                {parkingList.map((label) => (
                  <span
                    key={label}
                    className="flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[11px] text-gray-600 ring-1 ring-gray-200"
                  >
                    <Car size={9} />
                    {label}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* 全営業時間 */}
          {spot.openingHours?.weekdayText && spot.openingHours.weekdayText.length > 0 && (
            <div>
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">営業時間</p>
              <div className="space-y-0.5">
                {spot.openingHours.weekdayText.map((text, i) => (
                  <div
                    key={i}
                    className={`flex items-baseline gap-1.5 text-xs rounded px-1.5 py-0.5 ${
                      i === todayIdx
                        ? "bg-blue-50 text-blue-700 font-medium"
                        : "text-gray-600"
                    }`}
                  >
                    <span className="w-4 shrink-0 font-semibold">{WEEKDAY_SHORT[i]}</span>
                    <span className="flex-1">{text.replace(/^.+?:\s*/, "")}</span>
                    {i === todayIdx && (
                      <span className="text-[10px] text-blue-400 font-normal">今日</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="border-t border-gray-100 p-2.5 space-y-2">
        <button
          onClick={onAddToCandidate}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-gray-200 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
        >
          <Bookmark size={11} />
          候補リストに保存
        </button>

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

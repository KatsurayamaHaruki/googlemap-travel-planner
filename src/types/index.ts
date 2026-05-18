// ---------------------------------------------------------------------------
// 文化財
// ---------------------------------------------------------------------------

/** Supabase cultural_properties テーブルの category カラムの値（価値の高い順） */
export type CulturalPropertyCategory =
  // ── Tier 1: 特別指定 ──────────────────────────────────────────
  | "国宝"
  | "特別史跡"
  | "特別名勝"
  | "特別天然記念物"
  // ── Tier 2: 通常指定 ──────────────────────────────────────────
  | "重要文化財"
  | "史跡"
  | "名勝"
  | "天然記念物"
  | "重要文化的景観"
  | "重要伝統的建造物群保存地区";

/**
 * get_cultural_properties_in_bounds RPC の戻り値 1 行。
 * location (GEOMETRY) は RPC 内で lat/lng に展開済み。
 */
export interface CulturalProperty {
  id: number;
  wikidata_id: string;
  name: string;
  description: string | null;
  category: CulturalPropertyCategory;
  /** 重複指定を含む全カテゴリ（例: ["特別史跡", "特別名勝"]） */
  categories: CulturalPropertyCategory[];
  lat: number;
  lng: number;
  image_url: string | null;
  wikipedia_url: string | null;
}

// ---------------------------------------------------------------------------
// 共有・招待
// ---------------------------------------------------------------------------

export type TripRole = "owner" | "editor" | "viewer";

export interface TripMember {
  userId: string;
  displayName: string;
  email: string;
  avatarUrl?: string;
  role: Exclude<TripRole, "owner">;
  joinedAt: string;
}

export interface TripInviteLink {
  id: string;
  role: Exclude<TripRole, "owner">;
  createdAt: string;
  expiresAt?: string;
}

// ---------------------------------------------------------------------------
// 既存の旅行スポット型
// ---------------------------------------------------------------------------

export interface OpeningHoursPeriod {
  open: { day: number; time: string };  // day: 0=Sun..6=Sat, time: "HHMM"
  close?: { day: number; time: string };
}

export interface OpeningHours {
  periods: OpeningHoursPeriod[];
  weekdayText: string[];
}

export interface Spot {
  id: string;
  name: string;
  lat: number;
  lng: number;
  address: string;
  placeId?: string;
  website?: string;
  category?: string;
  memo: string;
  photos: string[];
  startTime?: string; // "HH:mm"
  duration?: number; // minutes
  order: number;
  openingHours?: OpeningHours;
}

export interface CandidateSpot {
  id: string;
  name: string;
  lat: number;
  lng: number;
  address: string;
  placeId?: string;
  website?: string;
  memo: string;
  photos: string[];
  openingHours?: OpeningHours;
  rating?: number;
  userRatingCount?: number;
  editorialSummary?: string;
}

export type TravelMode = "TRANSIT" | "DRIVING" | "WALKING";

export interface SavedRouteStep {
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

export interface SavedRoute {
  mode: TravelMode;
  duration: string;
  distance: string;
  transitFallback: boolean;
  transitSteps: SavedRouteStep[];
  overviewPath: { lat: number; lng: number }[];
}

export interface Day {
  id: string;
  date: string; // ISO date string "YYYY-MM-DD"
  spots: Spot[];
  routes?: Record<string, SavedRoute>; // key: "fromSpotId-toSpotId"
}

export interface Trip {
  id: string;
  title: string;
  destination: string;
  startDate: string; // "YYYY-MM-DD"
  endDate: string; // "YYYY-MM-DD"
  days: Day[];
  candidates: CandidateSpot[];
  createdAt: string;
  updatedAt: string;
  /** ランタイムのみ・DBには保存しない */
  role?: TripRole;
}

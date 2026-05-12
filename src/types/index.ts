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
}

export type TravelMode = "TRANSIT" | "DRIVING" | "WALKING";

export interface Day {
  id: string;
  date: string; // ISO date string "YYYY-MM-DD"
  spots: Spot[];
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
}

import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const origin = searchParams.get("origin");
  const destination = searchParams.get("destination");

  if (!origin || !destination) {
    return NextResponse.json({ error: "Missing params" }, { status: 400 });
  }

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const url = new URL("https://maps.googleapis.com/maps/api/directions/json");
  url.searchParams.set("origin", origin);
  url.searchParams.set("destination", destination);
  url.searchParams.set("mode", "transit");
  url.searchParams.set("departure_time", "now");
  url.searchParams.set("language", "ja");
  url.searchParams.set("key", apiKey!);

  // Forward the browser's Referer so API key referrer-restrictions are satisfied
  const referer = req.headers.get("referer") ?? req.headers.get("origin") ?? "";
  const res = await fetch(url.toString(), {
    headers: referer ? { Referer: referer } : {},
  });
  const data = await res.json();
  return NextResponse.json(data);
}

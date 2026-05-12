import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import type { Trip } from "@/types";

async function makeSupabase() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cs) {
          try { cs.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); }
          catch {}
        },
      },
    }
  );
}

interface RouteContext {
  params: Promise<{ token: string }>;
}

/** GET /api/invite/[token] — 招待トークン情報を取得 (未ログインでも可) */
export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { token } = await params;
  const supabase = await makeSupabase();

  const { data, error } = await supabase.rpc("get_invite_token_info", { p_token: token });
  if (error || !data?.length) {
    return NextResponse.json({ error: "Invalid or expired invite" }, { status: 404 });
  }

  const row = data[0] as { trip_id: string; trip_data: Trip; invite_role: string };
  const trip = row.trip_data;

  return NextResponse.json({
    tripId: row.trip_id,
    role: row.invite_role,
    trip: {
      title: trip.title,
      destination: trip.destination,
      startDate: trip.startDate,
      endDate: trip.endDate,
      days: trip.days,
    },
  });
}

/** POST /api/invite/[token]/join — 招待を受け入れてメンバーに追加 (ログイン必須) */
export async function POST(_req: NextRequest, { params }: RouteContext) {
  const { token } = await params;
  const supabase = await makeSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await supabase.rpc("accept_trip_invite", { p_token: token });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const row = data?.[0] as { result_trip_id: string; result_role: string } | undefined;
  if (!row) return NextResponse.json({ error: "Failed to join" }, { status: 500 });

  return NextResponse.json({ tripId: row.result_trip_id, role: row.result_role });
}

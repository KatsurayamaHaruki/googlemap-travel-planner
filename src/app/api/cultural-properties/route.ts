import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { CulturalProperty } from "@/types";

// 文化財データは静的なため、モジュールスコープでクライアントを使い回す
// （anon キー + RLS SELECT ポリシーで保護済み）
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/** フロントエンドから受け取る 1 リクエストの最大件数上限 */
const MAX_LIMIT = 500;

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(req.url);

    const north = parseFloat(searchParams.get("north") ?? "");
    const south = parseFloat(searchParams.get("south") ?? "");
    const east  = parseFloat(searchParams.get("east")  ?? "");
    const west  = parseFloat(searchParams.get("west")  ?? "");
    const limit = Math.min(
      parseInt(searchParams.get("limit") ?? "200", 10),
      MAX_LIMIT
    );

    if ([north, south, east, west].some((v) => !isFinite(v))) {
      return NextResponse.json(
        { error: "north/south/east/west が不正です" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .rpc("get_cultural_properties_in_bounds", {
        min_lng: west,
        min_lat: south,
        max_lng: east,
        max_lat: north,
        max_results: limit,
      })
      .returns<CulturalProperty[]>();

    if (error) {
      console.error("[api/cultural-properties] Supabase error:", JSON.stringify(error));
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // 文化財データはほぼ変化しないため 5 分キャッシュ
    return NextResponse.json(data ?? [], {
      headers: {
        "Cache-Control": "public, max-age=300, stale-while-revalidate=60",
      },
    });
  } catch (err) {
    console.error("[api/cultural-properties] Uncaught exception:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

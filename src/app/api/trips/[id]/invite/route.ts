import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

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
  params: Promise<{ id: string }>;
}

/** GET /api/trips/[id]/invite — メンバー一覧と招待リンク一覧を返す */
export async function GET(_req: NextRequest, { params }: RouteContext) {
  const { id: tripId } = await params;
  const supabase = await makeSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // オーナー確認
  const { data: trip } = await supabase
    .from("trips")
    .select("user_id")
    .eq("id", tripId)
    .single();
  if (!trip) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (trip.user_id !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [{ data: members }, { data: links }] = await Promise.all([
    supabase.from("trip_members").select("user_id, role, joined_at").eq("trip_id", tripId),
    supabase
      .from("trip_invite_links")
      .select("id, role, created_at, expires_at")
      .eq("trip_id", tripId)
      .order("created_at", { ascending: false }),
  ]);

  // メンバーのプロフィール取得
  const memberIds = (members ?? []).map((m) => m.user_id);
  const ownerProfilesResult = memberIds.length > 0
    ? await supabase.from("profiles").select("id, email, display_name, avatar_url").in("id", [user.id, ...memberIds])
    : await supabase.from("profiles").select("id, email, display_name, avatar_url").eq("id", user.id);

  const profileMap = new Map(
    (ownerProfilesResult.data ?? []).map((p) => [p.id, p])
  );

  const ownerProfile = profileMap.get(user.id);
  const memberList = [
    {
      userId: user.id,
      displayName: ownerProfile?.display_name ?? ownerProfile?.email ?? user.id,
      email: ownerProfile?.email ?? "",
      avatarUrl: ownerProfile?.avatar_url ?? null,
      role: "owner",
      joinedAt: null,
    },
    ...(members ?? []).map((m) => {
      const p = profileMap.get(m.user_id);
      return {
        userId: m.user_id,
        displayName: p?.display_name ?? p?.email ?? m.user_id,
        email: p?.email ?? "",
        avatarUrl: p?.avatar_url ?? null,
        role: m.role,
        joinedAt: m.joined_at,
      };
    }),
  ];

  return NextResponse.json({
    members: memberList,
    inviteLinks: (links ?? []).map((l) => ({
      id: l.id,
      role: l.role,
      createdAt: l.created_at,
      expiresAt: l.expires_at,
    })),
  });
}

/** POST /api/trips/[id]/invite — 招待リンクを作成 */
export async function POST(req: NextRequest, { params }: RouteContext) {
  const { id: tripId } = await params;
  const supabase = await makeSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { role } = await req.json() as { role: "editor" | "viewer" };
  if (role !== "editor" && role !== "viewer") {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  // オーナー確認
  const { data: trip } = await supabase
    .from("trips")
    .select("user_id")
    .eq("id", tripId)
    .single();
  if (!trip) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (trip.user_id !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { data: link, error } = await supabase
    .from("trip_invite_links")
    .insert({ trip_id: tripId, role, created_by: user.id })
    .select("id, role, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ id: link.id, role: link.role, createdAt: link.created_at });
}

/** DELETE /api/trips/[id]/invite?linkId=xxx — 招待リンクを削除 */
export async function DELETE(req: NextRequest, { params }: RouteContext) {
  const { id: tripId } = await params;
  const linkId = new URL(req.url).searchParams.get("linkId");
  if (!linkId) return NextResponse.json({ error: "linkId required" }, { status: 400 });

  const supabase = await makeSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: trip } = await supabase
    .from("trips")
    .select("user_id")
    .eq("id", tripId)
    .single();
  if (!trip || trip.user_id !== user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { error } = await supabase
    .from("trip_invite_links")
    .delete()
    .eq("id", linkId)
    .eq("trip_id", tripId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

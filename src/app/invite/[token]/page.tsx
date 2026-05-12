"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { MapPin, Calendar, Users, ArrowRight, LogIn } from "lucide-react";
import { createClient } from "@/lib/supabase";
import { formatDate } from "@/lib/utils";
import type { User } from "@supabase/supabase-js";

interface InviteInfo {
  tripId: string;
  role: "editor" | "viewer";
  trip: {
    title: string;
    destination: string;
    startDate: string;
    endDate: string;
    days: Array<{ id: string; spots: Array<unknown> }>;
  };
}

const ROLE_LABEL: Record<string, string> = {
  editor: "編集者",
  viewer: "閲覧者",
};

const ROLE_DESC: Record<string, string> = {
  editor: "スポットの追加・編集ができます",
  viewer: "プランの閲覧のみできます",
};

interface PageProps {
  params: Promise<{ token: string }>;
}

export default function InvitePage({ params }: PageProps) {
  const { token } = use(params);
  const router = useRouter();

  const [info, setInfo] = useState<InviteInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [joining, setJoining] = useState(false);
  const [joined, setJoined] = useState(false);

  // 招待情報を取得
  useEffect(() => {
    fetch(`/api/invite/${token}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.error) setError(data.error);
        else setInfo(data as InviteInfo);
      })
      .catch(() => setError("招待情報の取得に失敗しました"));
  }, [token]);

  // ログイン状態を確認
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
  }, []);

  async function handleJoin() {
    if (!user) {
      router.push(`/login?next=${encodeURIComponent(`/invite/${token}`)}`);
      return;
    }
    setJoining(true);
    const res = await fetch(`/api/invite/${token}`, { method: "POST" });
    const data = await res.json();
    if (data.error) {
      setError(data.error);
      setJoining(false);
      return;
    }
    setJoined(true);
    setTimeout(() => router.push(`/trips/${data.tripId}`), 1200);
  }

  if (error) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-xl text-center">
          <MapPin className="mx-auto mb-3 text-gray-300" size={40} />
          <h2 className="mb-2 font-semibold text-gray-700">招待リンクが無効です</h2>
          <p className="mb-5 text-sm text-gray-500">{error}</p>
          <button
            onClick={() => router.push("/")}
            className="text-sm text-blue-600 hover:underline"
          >
            トップへ戻る
          </button>
        </div>
      </div>
    );
  }

  if (!info || user === undefined) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-400 border-t-transparent" />
      </div>
    );
  }

  if (joined) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
            <Users className="text-green-600" size={28} />
          </div>
          <p className="font-semibold text-gray-800">参加しました！</p>
          <p className="mt-1 text-sm text-gray-500">プランページに移動します…</p>
        </div>
      </div>
    );
  }

  const totalSpots = info.trip.days.reduce(
    (sum, d) => sum + (d.spots?.length ?? 0), 0
  );

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md">
        {/* ヘッダー */}
        <div className="mb-4 flex items-center gap-2">
          <MapPin className="text-blue-600" size={22} />
          <span className="font-bold text-gray-800">旅行プランナー</span>
        </div>

        <div className="rounded-2xl bg-white p-6 shadow-xl">
          <p className="mb-4 text-sm text-gray-500">旅行プランへの招待が届いています</p>

          {/* 旅行情報 */}
          <div className="mb-5 rounded-xl bg-gray-50 p-4">
            <h1 className="mb-1 text-lg font-bold text-gray-800 line-clamp-2">{info.trip.title}</h1>
            <div className="flex items-center gap-1.5 text-sm text-gray-500 mb-2">
              <MapPin size={13} />
              <span>{info.trip.destination}</span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-gray-400">
              <Calendar size={12} />
              <span>{formatDate(info.trip.startDate)} 〜 {formatDate(info.trip.endDate)}</span>
              <span className="ml-2">· {info.trip.days.length}日間</span>
              <span>· スポット{totalSpots}件</span>
            </div>
          </div>

          {/* 権限情報 */}
          <div className="mb-6 flex items-start gap-3 rounded-xl border border-blue-100 bg-blue-50 p-3">
            <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[11px] font-bold text-white">
              {ROLE_LABEL[info.role]?.[0] ?? "?"}
            </div>
            <div>
              <p className="text-sm font-semibold text-blue-800">
                {ROLE_LABEL[info.role] ?? info.role}として招待されています
              </p>
              <p className="text-xs text-blue-600">{ROLE_DESC[info.role]}</p>
            </div>
          </div>

          {/* アクション */}
          {user ? (
            <button
              onClick={handleJoin}
              disabled={joining}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
            >
              {joining ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <ArrowRight size={16} />
              )}
              {joining ? "参加中…" : "プランに参加する"}
            </button>
          ) : (
            <div className="space-y-3">
              <button
                onClick={handleJoin}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white hover:bg-blue-700"
              >
                <LogIn size={16} />
                ログインして参加する
              </button>
              <p className="text-center text-xs text-gray-400">
                ログインすることでプランにアクセスできます
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

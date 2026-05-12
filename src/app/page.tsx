"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Plus, MapPin, Trash2, Calendar, LogOut } from "lucide-react";
import { useTripStore } from "@/store/tripStore";
import { CreateTripModal } from "@/components/CreateTripModal";
import { formatDate, tripDuration } from "@/lib/utils";
import { createClient } from "@/lib/supabase";
import type { User } from "@supabase/supabase-js";

export default function HomePage() {
  const router = useRouter();
  const { trips, loading, loadTrips, createTrip, deleteTrip } = useTripStore();
  const [showModal, setShowModal] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      if (data.user) loadTrips();
    });
  }, [loadTrips]);

  async function handleLogout() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  function handleCreate(data: { title: string; destination: string; startDate: string; endDate: string }) {
    const trip = createTrip(data);
    router.push(`/trips/${trip.id}`);
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header
        className="bg-white border-b border-gray-200 px-6 py-4"
        style={{ paddingTop: "max(1rem, env(safe-area-inset-top))" }}
      >
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <div className="flex items-center gap-2">
            <MapPin className="text-blue-600" size={24} />
            <h1 className="text-xl font-bold text-gray-800">旅行プランナー</h1>
          </div>
          <div className="flex items-center gap-3">
            {user && (
              <span className="hidden text-sm text-gray-500 sm:block">{user.email}</span>
            )}
            <button
              onClick={() => setShowModal(true)}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
            >
              <Plus size={16} />
              新しい旅行
            </button>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-500 hover:bg-gray-50"
              title="ログアウト"
            >
              <LogOut size={15} />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-8">
        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-36 animate-pulse rounded-2xl bg-gray-200" />
            ))}
          </div>
        ) : trips.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="mb-4 rounded-full bg-blue-100 p-6">
              <MapPin className="text-blue-600" size={40} />
            </div>
            <h2 className="mb-2 text-xl font-semibold text-gray-700">旅行計画を始めましょう</h2>
            <p className="mb-6 text-sm text-gray-500">「新しい旅行」から旅の計画を作成できます</p>
            <button
              onClick={() => setShowModal(true)}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-3 text-sm font-medium text-white hover:bg-blue-700"
            >
              <Plus size={16} />
              最初の旅行を作成
            </button>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {trips
              .slice()
              .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
              .map((trip) => (
                <div
                  key={trip.id}
                  onClick={() => router.push(`/trips/${trip.id}`)}
                  className="group relative cursor-pointer rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200 transition hover:shadow-md hover:ring-blue-300"
                >
                  <button
                    onClick={(e) => { e.stopPropagation(); setConfirmDelete(trip.id); }}
                    className="absolute right-3 top-3 rounded-lg p-1.5 text-gray-300 opacity-0 transition hover:bg-red-50 hover:text-red-500 group-hover:opacity-100"
                  >
                    <Trash2 size={14} />
                  </button>
                  <div className="mb-3 flex items-center gap-2">
                    <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                      {trip.destination}
                    </span>
                    <span className="text-xs text-gray-400">{tripDuration(trip)}日間</span>
                  </div>
                  <h3 className="mb-2 font-semibold text-gray-800 line-clamp-2">{trip.title}</h3>
                  <div className="flex items-center gap-1.5 text-xs text-gray-500">
                    <Calendar size={12} />
                    <span>{formatDate(trip.startDate)} 〜 {formatDate(trip.endDate)}</span>
                  </div>
                  <div className="mt-3 text-xs text-gray-400">
                    スポット{" "}
                    <span className="font-medium text-gray-600">
                      {trip.days.reduce((sum, d) => sum + d.spots.length, 0)}
                    </span>
                    件
                  </div>
                </div>
              ))}
          </div>
        )}
      </main>

      {showModal && (
        <CreateTripModal onClose={() => setShowModal(false)} onCreate={handleCreate} />
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-80 rounded-2xl bg-white p-6 shadow-xl">
            <h3 className="mb-2 font-semibold text-gray-800">旅行を削除しますか？</h3>
            <p className="mb-5 text-sm text-gray-500">この操作は取り消せません。</p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDelete(null)}
                className="flex-1 rounded-lg border border-gray-300 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                キャンセル
              </button>
              <button
                onClick={() => { deleteTrip(confirmDelete); setConfirmDelete(null); }}
                className="flex-1 rounded-lg bg-red-500 py-2 text-sm text-white hover:bg-red-600"
              >
                削除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, LogOut, User, Map, Download, Smartphone, CheckCircle } from "lucide-react";
import { createClient } from "@/lib/supabase";
import { useSettingsStore, ALL_CATEGORIES } from "@/store/settingsStore";
import { CATEGORY_COLOR } from "@/lib/cultural-properties";
import { usePwaInstall } from "@/hooks/usePwaInstall";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import type { CulturalPropertyCategory } from "@/types";

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
        checked ? "bg-blue-600" : "bg-gray-300"
      }`}
    >
      <span
        className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  const { showCulturalProperties, enabledCategories, setShowCulturalProperties, toggleCategory, resetCategories } =
    useSettingsStore();
  const { state: pwaState, promptInstall } = usePwaInstall();

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
  }, []);

  async function handleLogout() {
    setLoggingOut(true);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  const allEnabled = enabledCategories.length === ALL_CATEGORIES.length;

  return (
    <div className="min-h-screen bg-gray-50">
      <header
        className="bg-white border-b border-gray-200 px-4 py-4"
        style={{ paddingTop: "max(1rem, env(safe-area-inset-top))" }}
      >
        <div className="mx-auto flex max-w-2xl items-center gap-3">
          <button
            onClick={() => router.back()}
            className="rounded-lg p-1.5 hover:bg-gray-100"
          >
            <ArrowLeft size={20} className="text-gray-600" />
          </button>
          <h1 className="text-lg font-bold text-gray-800">設定</h1>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-4 py-6 space-y-6">
        {/* アカウントセクション */}
        <section>
          <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-gray-400">
            アカウント
          </h2>
          <div className="rounded-2xl bg-white shadow-sm ring-1 ring-gray-200 overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-4 border-b border-gray-100">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 shrink-0">
                <User size={18} className="text-blue-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-gray-400">メールアドレス</p>
                <p className="truncate text-sm font-medium text-gray-800">
                  {user?.email ?? "読み込み中…"}
                </p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              disabled={loggingOut}
              className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-red-50 transition disabled:opacity-50"
            >
              <LogOut size={16} className="text-red-500 shrink-0" />
              <span className="text-sm font-medium text-red-500">
                {loggingOut ? "ログアウト中…" : "ログアウト"}
              </span>
            </button>
          </div>
        </section>

        {/* アプリインストールセクション */}
        {pwaState !== "unavailable" && (
          <section>
            <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-gray-400">
              アプリ
            </h2>
            <div className="rounded-2xl bg-white shadow-sm ring-1 ring-gray-200 overflow-hidden">
              {pwaState === "installed" && (
                <div className="flex items-center gap-3 px-4 py-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 shrink-0">
                    <CheckCircle size={18} className="text-green-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-800">インストール済み</p>
                    <p className="text-xs text-gray-400">ホーム画面からアプリとして起動できます</p>
                  </div>
                </div>
              )}

              {pwaState === "available" && (
                <button
                  onClick={promptInstall}
                  className="flex w-full items-center gap-3 px-4 py-4 text-left hover:bg-blue-50 transition"
                >
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 shrink-0">
                    <Download size={18} className="text-blue-600" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-800">ホーム画面に追加</p>
                    <p className="text-xs text-gray-400">アプリとしてインストールしてオフラインでも使えます</p>
                  </div>
                </button>
              )}

              {pwaState === "ios" && (
                <div className="flex items-start gap-3 px-4 py-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 shrink-0 mt-0.5">
                    <Smartphone size={18} className="text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-800">ホーム画面に追加</p>
                    <p className="text-xs text-gray-500 mt-1 leading-relaxed">
                      Safari の共有ボタン（
                      <span className="font-semibold">⎋</span>
                      ）をタップし、「ホーム画面に追加」を選択してください。
                    </p>
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* 文化財セクション */}
        <section>
          <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-gray-400">
            地図 / 文化財
          </h2>
          <div className="rounded-2xl bg-white shadow-sm ring-1 ring-gray-200 overflow-hidden">
            {/* メイントグル */}
            <div className="flex items-center justify-between px-4 py-4 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 shrink-0">
                  <Map size={18} className="text-amber-600" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-800">文化財を地図に表示</p>
                  <p className="text-xs text-gray-400">国宝・重要文化財などをマップ上に表示します</p>
                </div>
              </div>
              <Toggle checked={showCulturalProperties} onChange={setShowCulturalProperties} />
            </div>

            {/* カテゴリフィルター（メイントグルがONのときのみ） */}
            {showCulturalProperties && (
              <div className="px-4 py-3">
                <div className="flex items-center justify-between mb-2.5">
                  <p className="text-xs font-semibold text-gray-500">表示カテゴリ</p>
                  {!allEnabled && (
                    <button
                      onClick={resetCategories}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      すべて選択
                    </button>
                  )}
                </div>
                <div className="space-y-1.5">
                  {ALL_CATEGORIES.map((cat: CulturalPropertyCategory) => {
                    const isEnabled = enabledCategories.includes(cat);
                    return (
                      <label
                        key={cat}
                        className="flex items-center gap-3 rounded-xl px-2 py-2 cursor-pointer hover:bg-gray-50 select-none"
                      >
                        <input
                          type="checkbox"
                          checked={isEnabled}
                          onChange={() => toggleCategory(cat)}
                          className="sr-only"
                        />
                        <span
                          className="inline-block h-3 w-3 shrink-0 rounded-full"
                          style={{ background: CATEGORY_COLOR[cat] }}
                        />
                        <span className="flex-1 text-sm text-gray-700">{cat}</span>
                        <span
                          className={`flex h-5 w-5 items-center justify-center rounded border-2 transition ${
                            isEnabled
                              ? "border-blue-600 bg-blue-600"
                              : "border-gray-300 bg-white"
                          }`}
                        >
                          {isEnabled && (
                            <svg
                              className="h-3 w-3 text-white"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth={3}
                              viewBox="0 0 12 12"
                            >
                              <polyline points="1.5,6 4.5,9 10.5,3" />
                            </svg>
                          )}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

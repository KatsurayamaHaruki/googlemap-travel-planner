-- ============================================================
-- 000_initial_trips.sql
-- Supabase ダッシュボード > SQL Editor で実行してください
-- 001_trip_sharing.sql より先に実行する必要があります
-- ============================================================

-- trips テーブル
CREATE TABLE IF NOT EXISTS trips (
  id          TEXT PRIMARY KEY,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  data        JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS trips_user_id_idx ON trips (user_id);
CREATE INDEX IF NOT EXISTS trips_updated_at_idx ON trips (updated_at DESC);

-- RLS 有効化
ALTER TABLE trips ENABLE ROW LEVEL SECURITY;

-- 既存ポリシーを削除してから再作成（再実行時のエラー防止）
DO $$
DECLARE pol TEXT;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies WHERE tablename = 'trips' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON trips', pol);
  END LOOP;
END $$;

-- 初期ポリシー（001_trip_sharing.sql で上書きされる）
CREATE POLICY "trips_select_own" ON trips FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "trips_insert_own" ON trips FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "trips_update_own" ON trips FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY "trips_delete_own" ON trips FOR DELETE
  USING (user_id = auth.uid());

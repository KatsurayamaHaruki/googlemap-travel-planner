-- ============================================================
-- 002_fix_rls_recursion.sql
-- trips_select ↔ trip_members_select の循環参照を解消する
-- Supabase ダッシュボード > SQL Editor で実行してください
-- ============================================================

-- trips の owner かどうかを RLS をバイパスして確認する関数
-- SECURITY DEFINER = 関数オーナー権限で実行するため trips の RLS が発動しない
CREATE OR REPLACE FUNCTION is_trip_owner(p_trip_id TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM trips WHERE id = p_trip_id AND user_id = auth.uid()
  );
$$;

GRANT EXECUTE ON FUNCTION is_trip_owner TO authenticated;

-- trip_members_select を作り直す（trips への直接参照をやめて関数に置き換える）
DROP POLICY IF EXISTS "trip_members_select" ON trip_members;

CREATE POLICY "trip_members_select" ON trip_members FOR SELECT
  USING (
    user_id = auth.uid() OR
    is_trip_owner(trip_id)
  );

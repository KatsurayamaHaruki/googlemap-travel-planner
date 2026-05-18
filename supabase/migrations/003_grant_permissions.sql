-- ============================================================
-- 003_grant_permissions.sql
-- authenticated ロールにテーブル権限を付与する
-- Supabase ダッシュボード > SQL Editor で実行してください
-- ============================================================

-- trips
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.trips TO authenticated;

-- trip_members
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.trip_members TO authenticated;

-- trip_invite_links
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.trip_invite_links TO authenticated;

-- profiles
GRANT SELECT, INSERT, UPDATE ON TABLE public.profiles TO authenticated;

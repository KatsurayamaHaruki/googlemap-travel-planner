-- ============================================================
-- 001_trip_sharing.sql
-- Supabase ダッシュボード > SQL Editor で実行してください
-- trips.id は TEXT 型のため FK も TEXT で定義しています
-- ============================================================

-- ── 1. profiles テーブル ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email       TEXT,
  display_name TEXT,
  avatar_url  TEXT,
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select" ON profiles FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "profiles_insert" ON profiles FOR INSERT
  WITH CHECK (id = auth.uid());

CREATE POLICY "profiles_update" ON profiles FOR UPDATE
  USING (id = auth.uid());

-- 新規ユーザー登録時に自動でプロフィールを作成するトリガー
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO profiles (id, email, display_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- 既存ユーザーのプロフィールをバックフィル
INSERT INTO profiles (id, email, display_name, avatar_url)
SELECT
  id,
  email,
  COALESCE(raw_user_meta_data->>'full_name', email),
  raw_user_meta_data->>'avatar_url'
FROM auth.users
ON CONFLICT (id) DO NOTHING;


-- ── 2. trip_members テーブル ──────────────────────────────────
-- trips.id は TEXT 型なので trip_id も TEXT
CREATE TABLE IF NOT EXISTS trip_members (
  trip_id   TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  user_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role      TEXT NOT NULL CHECK (role IN ('editor', 'viewer')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (trip_id, user_id)
);

ALTER TABLE trip_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "trip_members_select" ON trip_members FOR SELECT
  USING (
    user_id = auth.uid() OR
    EXISTS (SELECT 1 FROM trips WHERE id = trip_id AND user_id = auth.uid())
  );

CREATE POLICY "trip_members_insert" ON trip_members FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM trips WHERE id = trip_id AND user_id = auth.uid())
  );

CREATE POLICY "trip_members_delete" ON trip_members FOR DELETE
  USING (
    user_id = auth.uid() OR
    EXISTS (SELECT 1 FROM trips WHERE id = trip_id AND user_id = auth.uid())
  );


-- ── 3. trip_invite_links テーブル ────────────────────────────
CREATE TABLE IF NOT EXISTS trip_invite_links (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id    TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  role       TEXT NOT NULL CHECK (role IN ('editor', 'viewer')),
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

ALTER TABLE trip_invite_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "trip_invite_links_all" ON trip_invite_links FOR ALL
  USING (
    EXISTS (SELECT 1 FROM trips WHERE id = trip_id AND user_id = auth.uid())
  )
  WITH CHECK (
    created_by = auth.uid() AND
    EXISTS (SELECT 1 FROM trips WHERE id = trip_id AND user_id = auth.uid())
  );


-- ── 4. trips の RLS を更新 (メンバーもアクセス可能に) ──────────
DO $$
DECLARE pol TEXT;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies WHERE tablename = 'trips' AND schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON trips', pol);
  END LOOP;
END $$;

CREATE POLICY "trips_select" ON trips FOR SELECT
  USING (
    user_id = auth.uid() OR
    EXISTS (SELECT 1 FROM trip_members WHERE trip_id = trips.id AND user_id = auth.uid())
  );

CREATE POLICY "trips_insert" ON trips FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "trips_update" ON trips FOR UPDATE
  USING (
    user_id = auth.uid() OR
    EXISTS (SELECT 1 FROM trip_members WHERE trip_id = trips.id AND user_id = auth.uid() AND role = 'editor')
  );

CREATE POLICY "trips_delete" ON trips FOR DELETE
  USING (user_id = auth.uid());


-- ── 5. RPC: トークンから招待情報を取得 (匿名でも可) ──────────
CREATE OR REPLACE FUNCTION get_invite_token_info(p_token UUID)
RETURNS TABLE(trip_id TEXT, trip_data JSONB, invite_role TEXT)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT t.id, t.data, til.role
  FROM trip_invite_links til
  JOIN trips t ON t.id = til.trip_id
  WHERE til.id = p_token
    AND (til.expires_at IS NULL OR til.expires_at > NOW());
END;
$$;

GRANT EXECUTE ON FUNCTION get_invite_token_info TO anon;
GRANT EXECUTE ON FUNCTION get_invite_token_info TO authenticated;


-- ── 6. RPC: 招待を受け入れてメンバーに追加 (認証必須) ────────
CREATE OR REPLACE FUNCTION accept_trip_invite(p_token UUID)
RETURNS TABLE(result_trip_id TEXT, result_role TEXT)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_trip_id  TEXT;
  v_role     TEXT;
  v_owner_id UUID;
BEGIN
  SELECT til.trip_id, til.role INTO v_trip_id, v_role
  FROM trip_invite_links til
  WHERE til.id = p_token
    AND (til.expires_at IS NULL OR til.expires_at > NOW());

  IF v_trip_id IS NULL THEN
    RAISE EXCEPTION 'Invalid or expired invite token';
  END IF;

  SELECT user_id INTO v_owner_id FROM trips WHERE id = v_trip_id;

  IF v_owner_id = auth.uid() THEN
    RETURN QUERY SELECT v_trip_id, 'owner'::TEXT;
    RETURN;
  END IF;

  INSERT INTO trip_members (trip_id, user_id, role)
  VALUES (v_trip_id, auth.uid(), v_role)
  ON CONFLICT (trip_id, user_id) DO UPDATE SET role = EXCLUDED.role;

  RETURN QUERY SELECT v_trip_id, v_role;
END;
$$;

GRANT EXECUTE ON FUNCTION accept_trip_invite TO authenticated;

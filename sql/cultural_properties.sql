-- ============================================================
-- 文化財データベース セットアップ
-- Supabase SQL エディタにそのまま貼り付けて実行してください
-- ============================================================

-- ① PostGIS 拡張
CREATE EXTENSION IF NOT EXISTS postgis;

-- ② cultural_properties テーブル
CREATE TABLE IF NOT EXISTS cultural_properties (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  wikidata_id   TEXT UNIQUE NOT NULL,                        -- "Q12345" 形式
  name          TEXT NOT NULL,
  description   TEXT,
  category      TEXT NOT NULL,                               -- '国宝'|'重要文化財'|'特別史跡'|'史跡'
  location      GEOMETRY(Point, 4326) NOT NULL,
  image_url     TEXT,
  wikipedia_url TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ③ 空間インデックス (GIST) + カテゴリインデックス
CREATE INDEX IF NOT EXISTS cultural_properties_location_gist
  ON cultural_properties USING GIST (location);

CREATE INDEX IF NOT EXISTS cultural_properties_category_idx
  ON cultural_properties (category);

-- ④ テーブル権限 + RLS 設定（読み取りは誰でも可）
-- PostgreSQL はテーブル権限を RLS より先にチェックするため、両方必要
GRANT SELECT ON public.cultural_properties TO anon, authenticated;

ALTER TABLE cultural_properties ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public_read_cultural_properties" ON cultural_properties;
CREATE POLICY "public_read_cultural_properties"
  ON cultural_properties
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- ⑤ バウンディングボックス検索 RPC
--    フロントエンドから { min_lng, min_lat, max_lng, max_lat, max_results } を受け取る
--    ST_MakeEnvelope(xmin, ymin, xmax, ymax, srid) = (west, south, east, north, 4326)
--    国宝を優先的に先頭へ返すために ORDER BY CASE を使用
CREATE OR REPLACE FUNCTION get_cultural_properties_in_bounds(
  min_lng     FLOAT,
  min_lat     FLOAT,
  max_lng     FLOAT,
  max_lat     FLOAT,
  max_results INT DEFAULT 200
)
RETURNS TABLE (
  id            BIGINT,
  wikidata_id   TEXT,
  name          TEXT,
  description   TEXT,
  category      TEXT,
  lat           FLOAT,
  lng           FLOAT,
  image_url     TEXT,
  wikipedia_url TEXT
)
LANGUAGE SQL
STABLE
AS $$
  SELECT
    cp.id,
    cp.wikidata_id,
    cp.name,
    cp.description,
    cp.category,
    ST_Y(cp.location::geometry) AS lat,
    ST_X(cp.location::geometry) AS lng,
    cp.image_url,
    cp.wikipedia_url
  FROM cultural_properties cp
  WHERE ST_Within(
    cp.location::geometry,
    ST_MakeEnvelope(min_lng, min_lat, max_lng, max_lat, 4326)
  )
  ORDER BY
    CASE cp.category
      WHEN '国宝'                     THEN 1
      WHEN '特別史跡'                 THEN 2
      WHEN '特別名勝'                 THEN 3
      WHEN '特別天然記念物'           THEN 4
      WHEN '重要文化財'               THEN 5
      WHEN '史跡'                     THEN 6
      WHEN '名勝'                     THEN 7
      WHEN '天然記念物'               THEN 8
      WHEN '重要文化的景観'           THEN 9
      WHEN '重要伝統的建造物群保存地区' THEN 10
      ELSE 11
    END
  LIMIT max_results;
$$;

-- anon にも EXECUTE を許可（RLS の SELECT ポリシーで保護される）
GRANT EXECUTE ON FUNCTION get_cultural_properties_in_bounds(FLOAT, FLOAT, FLOAT, FLOAT, INT)
  TO anon, authenticated;

-- ⑥ シードスクリプト用バッチ Upsert RPC
--    service_role キーでのみ呼び出す想定
CREATE OR REPLACE FUNCTION batch_upsert_cultural_properties(properties JSONB)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER   -- 関数オーナー権限で実行 → INSERT ポリシーなしでも挿入可能
SET search_path = public
AS $$
DECLARE
  item JSONB;
  cnt  INT := 0;
BEGIN
  FOR item IN SELECT * FROM jsonb_array_elements(properties)
  LOOP
    INSERT INTO cultural_properties (
      wikidata_id, name, category, location, image_url, wikipedia_url, description
    ) VALUES (
      item->>'wikidata_id',
      item->>'name',
      item->>'category',
      ST_SetSRID(
        ST_MakePoint((item->>'lng')::FLOAT, (item->>'lat')::FLOAT),
        4326
      ),
      NULLIF(item->>'image_url', ''),
      NULLIF(item->>'wikipedia_url', ''),
      NULLIF(item->>'description', '')
    )
    ON CONFLICT (wikidata_id) DO UPDATE SET
      name          = EXCLUDED.name,
      category      = EXCLUDED.category,
      location      = EXCLUDED.location,
      image_url     = COALESCE(EXCLUDED.image_url,     cultural_properties.image_url),
      wikipedia_url = COALESCE(EXCLUDED.wikipedia_url, cultural_properties.wikipedia_url),
      description   = COALESCE(EXCLUDED.description,   cultural_properties.description);
    cnt := cnt + 1;
  END LOOP;
  RETURN cnt;
END;
$$;

-- anon / authenticated から batch_upsert を禁止
-- service_role は SECURITY DEFINER を問わず常に実行できる
REVOKE EXECUTE ON FUNCTION batch_upsert_cultural_properties(JSONB)
  FROM anon, authenticated;

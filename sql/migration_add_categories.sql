-- ============================================================
-- マイグレーション: categories 列の追加と関数の更新
-- Supabase SQL エディタにそのまま貼り付けて実行してください
-- ============================================================

-- ① categories 列を追加（重複指定の全カテゴリを配列で保持）
ALTER TABLE cultural_properties
  ADD COLUMN IF NOT EXISTS categories TEXT[] DEFAULT '{}';

-- ② 既存行の categories を現在の category から初期化
UPDATE cultural_properties
SET categories = ARRAY[category]
WHERE categories = '{}' OR categories IS NULL;

-- ③ batch_upsert を更新
--    処理順を「低優先度→高優先度」にすることで最後に上書きされる category が
--    常に最高優先度になる（seed スクリプト側で CATEGORIES を逆順に処理する）。
--    categories 列には全指定を重複なく蓄積する。
CREATE OR REPLACE FUNCTION batch_upsert_cultural_properties(properties JSONB)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item JSONB;
  cnt  INT := 0;
BEGIN
  FOR item IN SELECT * FROM jsonb_array_elements(properties)
  LOOP
    INSERT INTO cultural_properties (
      wikidata_id, name, category, categories,
      location, image_url, wikipedia_url, description
    ) VALUES (
      item->>'wikidata_id',
      item->>'name',
      item->>'category',
      ARRAY[item->>'category'],
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
      -- 逆順処理により最後＝最高優先度で上書き
      category      = EXCLUDED.category,
      -- 重複なく配列に蓄積
      categories    = CASE
        WHEN EXCLUDED.category = ANY(cultural_properties.categories)
        THEN cultural_properties.categories
        ELSE cultural_properties.categories || EXCLUDED.categories
      END,
      location      = EXCLUDED.location,
      image_url     = COALESCE(EXCLUDED.image_url,     cultural_properties.image_url),
      wikipedia_url = COALESCE(EXCLUDED.wikipedia_url, cultural_properties.wikipedia_url),
      description   = COALESCE(EXCLUDED.description,   cultural_properties.description);
    cnt := cnt + 1;
  END LOOP;
  RETURN cnt;
END;
$$;

REVOKE EXECUTE ON FUNCTION batch_upsert_cultural_properties(JSONB) FROM anon, authenticated;

-- ④ get_cultural_properties_in_bounds を更新（categories 列を追加）
-- 戻り型が変わるため DROP してから再作成
DROP FUNCTION IF EXISTS get_cultural_properties_in_bounds(FLOAT, FLOAT, FLOAT, FLOAT, INT);

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
  categories    TEXT[],
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
    cp.categories,
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
      WHEN '国宝'                       THEN 1
      WHEN '特別史跡'                   THEN 2
      WHEN '特別名勝'                   THEN 3
      WHEN '特別天然記念物'             THEN 4
      WHEN '重要文化財'                 THEN 5
      WHEN '史跡'                       THEN 6
      WHEN '名勝'                       THEN 7
      WHEN '天然記念物'                 THEN 8
      WHEN '重要文化的景観'             THEN 9
      WHEN '重要伝統的建造物群保存地区' THEN 10
      ELSE 11
    END
  LIMIT max_results;
$$;

GRANT EXECUTE ON FUNCTION get_cultural_properties_in_bounds(FLOAT, FLOAT, FLOAT, FLOAT, INT)
  TO anon, authenticated;

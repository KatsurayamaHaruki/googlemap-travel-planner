/**
 * scripts/seed-cultural-properties.ts
 *
 * Wikidata SPARQL → Supabase cultural_properties テーブルへ一括投入。
 *
 * 実行前に scripts/.env を作成:
 *   SUPABASE_URL=https://xxxx.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY=eyJ...
 *
 * 実行コマンド:
 *   npx tsx --env-file=scripts/.env scripts/seed-cultural-properties.ts
 *
 * 初回インストール (devDependency):
 *   npm install -D tsx
 */

import { createClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------------------
// 環境変数チェック
// ---------------------------------------------------------------------------
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    "❌ SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY を scripts/.env に設定してください"
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------
const WIKIDATA_SPARQL = "https://query.wikidata.org/sparql";

/**
 * 取得カテゴリ（価値の高い順）。
 *
 * Wikidata P1435（文化財指定）の日本語ラベルで絞り込むため、
 * QID をハードコードせずに済む。QID は Wikidata の内部事情で変わりうるが
 * ラベルは文化庁の公式名称に対応しており安定している。
 *
 * Wikidata Query Service で指定ラベルに紐付く QID を確認する場合は
 * 以下の SPARQL をそのまま実行してください:
 * https://query.wikidata.org/#
 *   SELECT%20%3Fdes%20%3FdesLabel%20%3Fcount%20WHERE%20%7B%0A%20%20%7B%0A%20%20%20%20SELECT%20%3Fdes%20%28COUNT%28%3Fitem%29%20AS%20%3Fcount%29%20WHERE%20%7B%0A%20%20%20%20%20%20%3Fitem%20wdt%3AP17%20wd%3AQ17%20%3B%0A%20%20%20%20%20%20%20%20%20%20%20%20wdt%3AP1435%20%3Fdes%20%3B%0A%20%20%20%20%20%20%20%20%20%20%20%20wdt%3AP625%20%5B%5D%20.%0A%20%20%20%20%7D%20GROUP%20BY%20%3Fdes%0A%20%20%7D%0A%20%20SERVICE%20wikibase%3Alabel%20%7B%20bd%3AserviceParam%20wikibase%3Alanguage%20%22ja%2Cen%22%20.%20%7D%0A%7D%0AORDER%20BY%20DESC%28%3Fcount%29%0ALIMIT%2030
 */
const CATEGORIES = [
  // ── Tier 1: 特別指定（件数が少ないため全件取得しやすい） ──
  "国宝",
  "特別史跡",
  "特別名勝",
  "特別天然記念物",
  // ── Tier 2: 通常指定（件数が多いためページネーションが重要） ──
  "重要文化財",
  "史跡",
  "名勝",
  "天然記念物",
  "重要文化的景観",
  "重要伝統的建造物群保存地区",
] as const;

type Category = typeof CATEGORIES[number];

/**
 * カテゴリごとの取得上限（動作確認用）。
 * 本番シードを実行するときはこのオブジェクトを空にするか削除してください。
 * 設定がないカテゴリは上限なし（全件取得）。
 */
const CATEGORY_MAX_ITEMS: Partial<Record<Category, number>> = {
  重要文化財: 10,
  史跡:       10,
};

interface SparqlRow {
  wikidata_id: string;
  name: string;
  category: Category;
  lat: number;
  lng: number;
  image_url: string | null;
  wikipedia_url: string | null;
  description: string | null;
}

/** 1 SPARQL リクエストあたりの行数 */
const PAGE_SIZE = 500;
/** Supabase RPC への 1 バッチあたりの行数 */
const UPSERT_BATCH = 100;
/** Wikidata への連続リクエスト間の待機 ms（ポライトネスポリシー） */
const REQUEST_DELAY_MS = 2_000;

// ---------------------------------------------------------------------------
// SPARQL クエリ生成（カテゴリラベル × ページ）
// ---------------------------------------------------------------------------
// QID の代わりに P1435 の日本語ラベルで絞り込む。
// これにより Wikidata の QID 変更に依存しない堅牢な実装になる。
function buildSparqlQuery(categoryLabel: string, limit: number, offset: number): string {
  return `
SELECT DISTINCT ?item ?itemLabel ?lat ?lng ?image ?wikipedia WHERE {
  ?item wdt:P1435 ?des ;
        wdt:P17   wd:Q17 ;
        wdt:P625  ?coord .

  ?des rdfs:label "${categoryLabel}"@ja .

  OPTIONAL { ?item wdt:P18 ?image . }
  OPTIONAL {
    ?wp schema:about ?item ;
        schema:isPartOf <https://ja.wikipedia.org/> .
    BIND(STR(?wp) AS ?wikipedia)
  }

  BIND(geof:latitude(?coord)  AS ?lat)
  BIND(geof:longitude(?coord) AS ?lng)

  SERVICE wikibase:label { bd:serviceParam wikibase:language "ja,en" . }
}
ORDER BY ?item
LIMIT ${limit}
OFFSET ${offset}
`.trim();
}

// ---------------------------------------------------------------------------
// Wikidata フェッチ（リトライあり）
// ---------------------------------------------------------------------------
async function fetchSparql(
  categoryLabel: string,
  limit: number,
  offset: number,
  retries = 3
): Promise<SparqlRow[]> {
  const query = buildSparqlQuery(categoryLabel, limit, offset);
  const url = new URL(WIKIDATA_SPARQL);
  url.searchParams.set("query", query);
  url.searchParams.set("format", "json");

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url.toString(), {
        headers: {
          Accept: "application/sparql-results+json",
          // Wikidata はリクエスト元を識別できる User-Agent を要求する
          "User-Agent": "TravelPlannerSeed/1.0 (https://github.com/your-repo)",
        },
        signal: AbortSignal.timeout(90_000), // 90 秒タイムアウト
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${await res.text().catch(() => "")}`);
      }

      const json = await res.json() as {
        results: { bindings: Record<string, { value: string }>[] };
      };

      return json.results.bindings.map((b) => {
        const wikidataId = b.item?.value.replace("http://www.wikidata.org/entity/", "");
        // Wikimedia Commons の画像 URL を HTTPS に正規化
        const rawImage = b.image?.value ?? null;
        const imageUrl = rawImage ? rawImage.replace(/^http:/, "https:") : null;

        return {
          wikidata_id: wikidataId,
          name: b.itemLabel?.value ?? "",
          category: "国宝" as Category, // 後で上書き
          lat: parseFloat(b.lat?.value ?? "0"),
          lng: parseFloat(b.lng?.value ?? "0"),
          image_url: imageUrl,
          wikipedia_url: b.wikipedia?.value ?? null,
          description: null,
        };
      });
    } catch (err) {
      const isLast = attempt === retries;
      console.warn(`  ⚠️  SPARQL attempt ${attempt}/${retries} failed: ${err}`);
      if (isLast) throw err;
      await delay(5_000 * attempt);
    }
  }
  return [];
}

// ---------------------------------------------------------------------------
// ユーティリティ
// ---------------------------------------------------------------------------
function delay(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms));
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// ---------------------------------------------------------------------------
// Supabase バッチ Upsert
// ---------------------------------------------------------------------------
async function upsertBatch(rows: SparqlRow[]): Promise<number> {
  const { data, error } = await supabase.rpc("batch_upsert_cultural_properties", {
    properties: rows,
  });
  if (error) throw new Error(error.message);
  return (data as number) ?? 0;
}

// ---------------------------------------------------------------------------
// カテゴリ 1 件を全ページ取得 → Upsert
// ---------------------------------------------------------------------------
async function seedCategory(label: Category): Promise<void> {
  const maxItems = CATEGORY_MAX_ITEMS[label] ?? Infinity;
  const limitNote = isFinite(maxItems) ? ` (上限 ${maxItems} 件)` : "";
  console.log(`\n📂 [${label}] 取得開始${limitNote}`);

  let offset = 0;
  let totalFetched = 0;
  let totalUpserted = 0;

  while (true) {
    const remaining = maxItems - totalFetched;
    if (remaining <= 0) break;

    // ページサイズを上限に合わせて縮小
    const fetchLimit = Math.min(PAGE_SIZE, remaining);
    process.stdout.write(`  ↓ offset=${offset} (最大${fetchLimit}件) ... `);

    let rows: SparqlRow[];
    try {
      rows = await fetchSparql(label, fetchLimit, offset);
    } catch (err) {
      console.error(`\n  ❌ SPARQL 失敗 (offset=${offset}): ${err}`);
      break;
    }

    if (rows.length === 0) {
      console.log("完了");
      break;
    }

    // カテゴリラベルを付与 & 不正データを除外
    const valid = rows
      .map((r) => ({ ...r, category: label }))
      .filter((r) => r.name && !isNaN(r.lat) && !isNaN(r.lng));

    totalFetched += valid.length;

    // Supabase へバッチ投入
    for (const batch of chunk(valid, UPSERT_BATCH)) {
      try {
        const n = await upsertBatch(batch);
        totalUpserted += n;
      } catch (err) {
        console.error(`\n  ❌ Upsert 失敗: ${err}`);
      }
    }

    console.log(`${valid.length} 件 (無効除外後) を upsert`);

    if (rows.length < fetchLimit) break; // 最終ページ

    offset += fetchLimit;
    await delay(REQUEST_DELAY_MS);
  }

  console.log(`  ✅ [${label}] 計 ${totalFetched} 件取得 / ${totalUpserted} 件 upsert`);
}

// ---------------------------------------------------------------------------
// メイン
// ---------------------------------------------------------------------------
async function main() {
  console.log("🏯 文化財シードスクリプト 開始");
  // 低優先度から高優先度の順で処理する。
  // ON CONFLICT DO UPDATE が category を無条件上書きするため、
  // 最後に処理したカテゴリ（= 最高優先度）が DB に残る。
  // categories 配列は重複なく蓄積されるため重複指定も正確に記録される。
  const processingOrder = [...CATEGORIES].reverse();
  console.log(`   処理順 (低→高優先度): ${processingOrder.join(", ")}\n`);

  for (const label of processingOrder) {
    await seedCategory(label);
  }

  // 最終レポート
  const { count, error } = await supabase
    .from("cultural_properties")
    .select("*", { count: "exact", head: true });

  if (!error) {
    console.log(`\n🎉 完了！ DB 合計 ${count} 件`);
  }
}

main().catch((err) => {
  console.error("❌ Fatal:", err);
  process.exit(1);
});

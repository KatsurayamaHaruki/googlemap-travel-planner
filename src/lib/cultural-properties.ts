import type { CulturalProperty, CulturalPropertyCategory } from "@/types";

// ---------------------------------------------------------------------------
// カテゴリ別色・略称（TripMap と PendingSpotCard で共用）
// ---------------------------------------------------------------------------
// 色: 文化財→赤系, 史跡→緑系, 名勝→青系, 自然→紫系, Tier1は暗色・Tier2は中色
export const CATEGORY_COLOR: Record<CulturalPropertyCategory, string> = {
  国宝:                       "#8B0000",
  特別史跡:                   "#1B5E20",
  特別名勝:                   "#0D47A1",
  特別天然記念物:             "#4A148C",
  重要文化財:                 "#C0392B",
  史跡:                       "#388E3C",
  名勝:                       "#1565C0",
  天然記念物:                 "#7B1FA2",
  重要文化的景観:             "#00695C",
  重要伝統的建造物群保存地区: "#5D4037",
};

export const CATEGORY_LABEL: Record<CulturalPropertyCategory, string> = {
  国宝:                       "国宝",
  特別史跡:                   "特史",
  特別名勝:                   "特名",
  特別天然記念物:             "特天",
  重要文化財:                 "重文",
  史跡:                       "史跡",
  名勝:                       "名勝",
  天然記念物:                 "天然",
  重要文化的景観:             "景観",
  重要伝統的建造物群保存地区: "伝建",
};

// ---------------------------------------------------------------------------
// グリッドベースのクライアントサイドクラスタリング
// ---------------------------------------------------------------------------
export interface CulturalPropertyCluster {
  /** グリッドセルキー（AdvancedMarker の key に使用） */
  key: string;
  /** クラスタ代表座標（最初の item の座標） */
  lat: number;
  lng: number;
  /** このセルに含まれる文化財（API から優先度順で返る） */
  items: CulturalProperty[];
  /** 最高優先度カテゴリ（マーカー色の基準） */
  topCategory: CulturalPropertyCategory;
}

/**
 * zoom レベルに応じたグリッドサイズで文化財をクラスタリングする。
 *
 * gridSize (度) = 1 / 2^(zoom-8)
 *   zoom 12 → ~7km  zoom 14 → ~1.7km  zoom 16 → ~430m  zoom 18 → ~110m
 *
 * items は API が優先度順で返すため、先頭が最高優先度カテゴリになる。
 */
export function clusterCulturalProperties(
  properties: CulturalProperty[],
  zoom: number
): CulturalPropertyCluster[] {
  if (properties.length === 0) return [];

  const gridSize = 1 / Math.pow(2, zoom - 8);
  const grid = new Map<string, CulturalPropertyCluster>();

  for (const cp of properties) {
    const key = `${Math.floor(cp.lat / gridSize)},${Math.floor(cp.lng / gridSize)}`;
    if (!grid.has(key)) {
      grid.set(key, {
        key,
        lat: cp.lat,
        lng: cp.lng,
        items: [],
        topCategory: cp.category, // 先頭 = 最高優先度
      });
    }
    grid.get(key)!.items.push(cp);
  }

  return Array.from(grid.values());
}

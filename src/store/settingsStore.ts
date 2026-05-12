import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { CulturalPropertyCategory } from "@/types";

export const ALL_CATEGORIES: CulturalPropertyCategory[] = [
  "国宝",
  "特別史跡",
  "特別名勝",
  "特別天然記念物",
  "重要文化財",
  "史跡",
  "名勝",
  "天然記念物",
  "重要文化的景観",
  "重要伝統的建造物群保存地区",
];

interface SettingsStore {
  showCulturalProperties: boolean;
  enabledCategories: CulturalPropertyCategory[];
  setShowCulturalProperties: (v: boolean) => void;
  toggleCategory: (cat: CulturalPropertyCategory) => void;
  resetCategories: () => void;
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      showCulturalProperties: true,
      enabledCategories: [...ALL_CATEGORIES],
      setShowCulturalProperties: (v) => set({ showCulturalProperties: v }),
      toggleCategory: (cat) =>
        set((state) => {
          const has = state.enabledCategories.includes(cat);
          return {
            enabledCategories: has
              ? state.enabledCategories.filter((c) => c !== cat)
              : [...state.enabledCategories, cat],
          };
        }),
      resetCategories: () => set({ enabledCategories: [...ALL_CATEGORIES] }),
    }),
    { name: "travel-planner-settings" }
  )
);

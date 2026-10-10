import { createBackup, type BackupFile } from "@/domain/backup/backup";
import { addDays, type IsoDate, type IsoDateTime } from "@/domain/common/dates";
import { localize, type LocalizedText } from "@/domain/common/localizedText";
import type { CookingSession, CookingSessionItem } from "@/domain/cooking/types";
import type { InventoryLot, InventoryTransaction } from "@/domain/inventory/types";
import type { AppSettings } from "@/domain/settings/settings";

/**
 * Sample data for the browser preview: the inventory from PROJECT_BRIEF 7.7,
 * a few cooking sessions and one pair of deductions recorded before sessions
 * existed. Dates are relative to `today`, so the recent / older split and the
 * repeat hint look the same whenever it is loaded. Lots, transactions and
 * sessions agree: each lot's remaining amount is its added amount minus the
 * deductions recorded against it.
 */
export function buildDemoBackup(today: IsoDate, settings: AppSettings): BackupFile {
  const day = (offset: number) => addDays(today, offset);
  const at = (offset: number, hour: number, minute = 0): IsoDateTime => {
    const [y = 0, m = 1, d = 1] = day(offset).split("-").map(Number);
    return new Date(y, m - 1, d, hour, minute).toISOString();
  };

  const lots: InventoryLot[] = [];
  const transactions: InventoryTransaction[] = [];
  const addLot = (
    lot: Omit<InventoryLot, "createdAt" | "updatedAt" | "processing" | "opened">,
    addedAt: IsoDateTime,
    added: { grams?: number; count?: number },
  ) => {
    lots.push({ processing: [], opened: false, ...lot, createdAt: addedAt, updatedAt: addedAt });
    transactions.push({
      id: `tx-demo-add-${lot.id}`,
      inventoryLotId: lot.id,
      type: "add",
      quantityG: added.grams,
      quantityCount: added.count,
      createdAt: addedAt,
    });
  };

  addLot(
    {
      id: "lot-demo-misuji",
      ingredientDefinitionId: "beef_misuji_raw",
      cut: "misuji",
      form: "steak",
      originalWeightG: 251,
      remainingWeightG: 251,
      thicknessMm: 35,
      purchaseDate: day(-1),
      expirationDate: day(2),
      storage: "refrigerated",
      purchasePrice: 940,
      currency: "JPY",
    },
    at(-1, 18),
    { grams: 251 },
  );
  addLot(
    {
      id: "lot-demo-chicken",
      ingredientDefinitionId: "chicken_thigh_skin_on_raw",
      originalWeightG: 450,
      remainingWeightG: 300,
      skinOn: true,
      purchaseDate: day(-14),
      expirationDate: day(45),
      storage: "frozen",
    },
    at(-14, 18),
    { grams: 450 },
  );
  addLot(
    {
      id: "lot-demo-onion",
      ingredientDefinitionId: "onion_raw",
      originalWeightG: 250,
      remainingWeightG: 100,
      purchaseDate: day(-6),
      expirationDate: day(20),
      storage: "pantry",
    },
    at(-6, 18),
    { grams: 250 },
  );
  addLot(
    {
      id: "lot-demo-eggs",
      ingredientDefinitionId: "egg_whole",
      count: 6,
      unit: "piece",
      purchaseDate: day(-4),
      expirationDate: day(10),
      storage: "refrigerated",
    },
    at(-4, 18),
    { count: 8 },
  );
  addLot(
    {
      id: "lot-demo-shimeji",
      ingredientDefinitionId: "shimeji_raw",
      count: 1,
      unit: "bag",
      purchaseDate: day(-2),
      expirationDate: day(3),
      storage: "refrigerated",
    },
    at(-2, 18),
    { count: 1 },
  );
  addLot(
    {
      id: "lot-demo-spinach",
      ingredientDefinitionId: "spinach_raw",
      originalWeightG: 200,
      remainingWeightG: 200,
      purchaseDate: day(-6),
      expirationDate: day(-1),
      storage: "refrigerated",
    },
    at(-6, 18),
    { grams: 200 },
  );
  addLot(
    {
      id: "lot-demo-rice",
      ingredientDefinitionId: "rice_white_raw",
      originalWeightG: 2540,
      remainingWeightG: 2000,
      purchaseDate: day(-20),
      expirationDate: day(300),
      storage: "pantry",
    },
    at(-20, 18),
    { grams: 2540 },
  );

  // Before cooking sessions existed: two deductions for one curry, kept as separate rows.
  for (const [lotId, grams] of [
    ["lot-demo-chicken", 150],
    ["lot-demo-rice", 180],
  ] as const) {
    transactions.push({
      id: `tx-demo-legacy-${lotId}`,
      inventoryLotId: lotId,
      type: "consume",
      quantityG: grams,
      createdAt: at(-12, 19),
      recipeId: "recipe_japanese_curry",
    });
  }

  const names = {
    onion: { zhCN: "洋葱", enUS: "Onion", jaJP: "玉ねぎ" },
    rice: { zhCN: "大米（生）", enUS: "White rice (raw)", jaJP: "精白米" },
    egg: { zhCN: "鸡蛋", enUS: "Egg (whole)", jaJP: "鶏卵" },
    beefBelly: { zhCN: "牛五花", enUS: "Beef belly (short plate)", jaJP: "牛バラ" },
    spinach: { zhCN: "菠菜", enUS: "Spinach", jaJP: "ほうれん草" },
    tomato: { zhCN: "番茄", enUS: "Tomato", jaJP: "トマト" },
  } satisfies Record<string, LocalizedText>;

  const sessions: CookingSession[] = [];
  const addSession = (
    session: Omit<CookingSession, "localDate" | "cookedAt" | "note">,
    offset: number,
    hour: number,
    note?: LocalizedText,
  ) => {
    const cookedAt = at(offset, hour);
    sessions.push({
      ...session,
      cookedAt,
      localDate: day(offset),
      ...(note ? { note: localize(note, settings.language) } : {}),
    });
    for (const item of session.items) {
      if (!lots.some((lot) => lot.id === item.lotId)) continue;
      transactions.push({
        id: `tx-demo-${session.id}-${item.ingredientKey}`,
        inventoryLotId: item.lotId,
        type: "consume",
        quantityG: item.grams,
        quantityCount: item.count,
        createdAt: cookedAt,
        recipeId: session.recipeId,
        cookingSessionId: session.id,
      });
    }
  };
  const item = (
    ingredientKey: string,
    lotId: string,
    ingredientDefinitionId: string,
    ingredientName: LocalizedText,
    amount: Partial<CookingSessionItem>,
  ): CookingSessionItem => ({
    ingredientKey,
    lotId,
    ingredientDefinitionId,
    ingredientName,
    weightBasis: "exact",
    ...amount,
  });

  addSession(
    {
      id: "session-demo-spinach",
      recipeId: "recipe_spinach_ohitashi",
      recipeName: { zhCN: "日式凉拌菠菜", enUS: "Spinach ohitashi", jaJP: "ほうれん草のおひたし" },
      servings: 2,
      items: [item("greens", "lot-demo-old-spinach", "spinach_raw", names.spinach, { grams: 200 })],
    },
    -9,
    19,
  );
  addSession(
    {
      id: "session-demo-removed-recipe",
      recipeId: "recipe-demo-removed",
      recipeName: { zhCN: "番茄炒蛋", enUS: "Tomato and egg stir-fry", jaJP: "トマトと卵の炒め物" },
      servings: 2,
      items: [
        item("tomato", "lot-demo-old-tomatoes", "tomato_raw", names.tomato, { grams: 250 }),
        item("egg", "lot-demo-old-eggs", "egg_whole", names.egg, {
          count: 3,
          unit: "piece",
          estimatedGrams: 150,
          weightBasis: "estimated",
        }),
      ],
    },
    -5,
    12,
    {
      zhCN: "这个菜谱后来删掉了，记录还在。",
      enUS: "This recipe was deleted later; the record stays.",
      jaJP: "このレシピは後で削除しましたが、記録は残ります。",
    },
  );
  addSession(
    {
      id: "session-demo-gyudon",
      recipeId: "recipe_gyudon",
      recipeName: { zhCN: "牛丼", enUS: "Gyudon (beef rice bowl)", jaJP: "牛丼" },
      servings: 2,
      items: [
        item("beef", "lot-demo-used-up-beef", "beef_belly_raw", names.beefBelly, {
          form: "thin_slice",
          grams: 200,
        }),
        item("onion", "lot-demo-onion", "onion_raw", names.onion, { grams: 150 }),
        item("rice", "lot-demo-rice", "rice_white_raw", names.rice, { grams: 180 }),
      ],
    },
    -2,
    19,
    { zhCN: "汤汁多放了一点。", enUS: "A little extra broth.", jaJP: "つゆを少し多めに。" },
  );
  addSession(
    {
      id: "session-demo-fried-rice",
      recipeId: "recipe_egg_fried_rice",
      recipeName: { zhCN: "鸡蛋炒饭", enUS: "Egg fried rice", jaJP: "卵チャーハン" },
      servings: 2,
      items: [
        item("rice", "lot-demo-rice", "rice_white_raw", names.rice, { grams: 180 }),
        item("egg", "lot-demo-eggs", "egg_whole", names.egg, {
          count: 2,
          unit: "piece",
          estimatedGrams: 100,
          weightBasis: "estimated",
        }),
      ],
    },
    -1,
    12,
  );

  return createBackup(
    {
      ingredients: [],
      inventoryLots: lots,
      transactions,
      recipes: [],
      cookingSessions: sessions,
      settings,
    },
    at(0, 0),
  );
}

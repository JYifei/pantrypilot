import type { LocalizedText } from "@/domain/common/localizedText";
import type { Recipe, RecipeIngredient } from "@/domain/recipes/types";

/**
 * Built-in example recipes: simple home cooking that only uses built-in
 * ingredients. Amounts are typical home-cooking quantities, not tested
 * recipes from a cookbook, and are marked as demo data in the UI.
 *
 * Bump BUILTIN_RECIPES_VERSION whenever this list changes so existing
 * databases re-seed.
 */
export const BUILTIN_RECIPES_VERSION = "recipes-2026.10.1";

const t = (zhCN: string, enUS: string, jaJP: string): LocalizedText => ({ zhCN, enUS, jaJP });

/** Cooked rice may be replaced by uncooked rice (about 0.45 g per g cooked). */
const RICE_OPTIONS = [{ ingredientId: "rice_white_raw", ratio: 0.45 }];

const SEASONING = {
  soySauce: t("酱油", "Soy sauce", "醤油"),
  mirin: t("味醂", "Mirin", "みりん"),
  sake: t("料酒", "Cooking sake", "料理酒"),
  sugar: t("砂糖", "Sugar", "砂糖"),
  salt: t("盐", "Salt", "塩"),
  pepper: t("胡椒", "Pepper", "こしょう"),
  oil: t("食用油", "Cooking oil", "サラダ油"),
  ginger: t("生姜", "Ginger", "生姜"),
  garlic: t("大蒜", "Garlic", "にんにく"),
  dashi: t("高汤", "Dashi stock", "だし"),
  miso: t("味噌", "Miso", "味噌"),
  starch: t("淀粉", "Potato starch", "片栗粉"),
  oysterSauce: t("蚝油", "Oyster sauce", "オイスターソース"),
  doubanjiang: t("豆瓣酱", "Doubanjiang (chili bean paste)", "豆板醤"),
  tianmianjiang: t("甜面酱", "Sweet bean paste", "甜麺醤"),
  curryRoux: t("咖喱块", "Curry roux", "カレールウ"),
  bonito: t("木鱼花（可选）", "Bonito flakes (optional)", "かつお節（お好みで）"),
  butter: t("黄油（可选）", "Butter (optional)", "バター（お好みで）"),
} satisfies Record<string, LocalizedText>;

function recipe(
  input: Omit<Recipe, "dataQuality" | "isBuiltin" | "tags"> & { tags?: string[] },
): Recipe {
  return { tags: [], ...input, dataQuality: "demo", isBuiltin: true };
}

function line(
  key: string,
  ingredientId: string,
  grams: number,
  extra: Omit<RecipeIngredient, "key" | "ingredientId" | "grams"> = {},
): RecipeIngredient {
  return { key, ingredientId, grams, ...extra };
}

export const BUILTIN_RECIPES: readonly Recipe[] = [
  recipe({
    id: "recipe_ginger_pork",
    name: t("生姜烧猪肉", "Ginger pork", "豚の生姜焼き"),
    description: t(
      "日式家常下饭菜，薄切猪肉配洋葱。",
      "Japanese home-style thin-sliced pork with onion.",
      "定番のごはんが進むおかず。",
    ),
    servings: 2,
    timeMinutes: 20,
    tags: ["japanese", "pork"],
    ingredients: [
      line("pork", "pork_shoulder_loin_raw", 250, { anySpecies: "pork", form: "shogayaki_slice" }),
      line("onion", "onion_raw", 100),
      line("cabbage", "cabbage_raw", 150, { optional: true }),
    ],
    seasonings: [
      SEASONING.ginger,
      SEASONING.soySauce,
      SEASONING.mirin,
      SEASONING.sake,
      SEASONING.oil,
    ],
    steps: [
      t(
        "生姜磨泥，与酱油、味醂、料酒调成酱汁。",
        "Grate the ginger and mix with soy sauce, mirin and sake.",
        "生姜をすりおろし、醤油・みりん・酒と合わせる。",
      ),
      t(
        "洋葱切丝；卷心菜切细丝装盘备用。",
        "Slice the onion; shred the cabbage for serving.",
        "玉ねぎは薄切り、キャベツは千切りにして器に盛る。",
      ),
      t(
        "热锅放油，煎猪肉至变色，加入洋葱炒软。",
        "Fry the pork until it changes colour, then add the onion until soft.",
        "フライパンに油を熱して豚肉を焼き、玉ねぎを加えて炒める。",
      ),
      t(
        "倒入酱汁翻炒收汁，盛在卷心菜旁。",
        "Add the sauce, toss until glossy and serve next to the cabbage.",
        "タレを加えて絡め、キャベツの横に盛る。",
      ),
    ],
  }),
  recipe({
    id: "recipe_oyakodon",
    name: t("亲子丼", "Oyakodon (chicken and egg rice bowl)", "親子丼"),
    servings: 2,
    timeMinutes: 25,
    tags: ["japanese", "chicken", "rice_bowl"],
    ingredients: [
      line("chicken", "chicken_thigh_skin_on_raw", 250, {
        alternatives: [
          { ingredientId: "chicken_breast_skinless_raw" },
          { ingredientId: "chicken_tender_raw" },
        ],
      }),
      line("egg", "egg_whole", 150, { count: 3 }),
      line("onion", "onion_raw", 100),
      line("rice", "rice_cooked", 400, { alternatives: RICE_OPTIONS }),
    ],
    seasonings: [SEASONING.dashi, SEASONING.soySauce, SEASONING.mirin, SEASONING.sugar],
    steps: [
      t(
        "鸡肉切小块，洋葱切丝，鸡蛋打散。",
        "Cut the chicken into bite-sized pieces, slice the onion and beat the eggs.",
        "鶏肉は一口大、玉ねぎは薄切りにし、卵を溶く。",
      ),
      t(
        "小锅中煮开高汤和调味料，放入洋葱和鸡肉煮熟。",
        "Bring dashi and seasonings to a boil, then simmer the onion and chicken until cooked.",
        "だしと調味料を煮立て、玉ねぎと鶏肉を煮る。",
      ),
      t(
        "淋入蛋液，盖盖焖至半熟。",
        "Pour in the eggs, cover and cook until just set.",
        "溶き卵を回し入れ、ふたをして半熟にする。",
      ),
      t("盖在米饭上即可。", "Slide over bowls of rice.", "ごはんにのせる。"),
    ],
  }),
  recipe({
    id: "recipe_green_pepper_pork",
    name: t("青椒肉丝", "Stir-fried pork with green pepper", "青椒肉絲（チンジャオロース）"),
    servings: 2,
    timeMinutes: 20,
    tags: ["chinese", "pork"],
    ingredients: [
      line("pork", "pork_loin_raw", 200, { anySpecies: "pork", form: "strip" }),
      line("pepper", "green_pepper_raw", 150, { count: 4 }),
      line("shiitake", "shiitake_raw", 30, { optional: true }),
    ],
    seasonings: [
      SEASONING.soySauce,
      SEASONING.sake,
      SEASONING.oysterSauce,
      SEASONING.starch,
      SEASONING.oil,
    ],
    steps: [
      t(
        "猪肉切丝，用料酒、酱油和淀粉抓匀。",
        "Cut the pork into strips and coat with sake, soy sauce and starch.",
        "豚肉を細切りにし、酒・醤油・片栗粉をもみ込む。",
      ),
      t(
        "青椒和香菇切丝。",
        "Cut the peppers and shiitake into strips.",
        "ピーマンと椎茸を細切りにする。",
      ),
      t(
        "热油炒散肉丝，加入青椒和香菇快炒。",
        "Stir-fry the pork, then add the vegetables and toss quickly.",
        "豚肉を炒め、野菜を加えて手早く炒める。",
      ),
      t(
        "加蚝油和酱油调味出锅。",
        "Season with oyster sauce and soy sauce.",
        "オイスターソースと醤油で味を調える。",
      ),
    ],
  }),
  recipe({
    id: "recipe_salt_grilled_salmon",
    name: t("盐烤三文鱼", "Salt-grilled salmon", "鮭の塩焼き"),
    servings: 2,
    timeMinutes: 15,
    tags: ["japanese", "fish"],
    ingredients: [line("salmon", "salmon_atlantic_raw", 200, { count: 2, form: "fillet" })],
    seasonings: [SEASONING.salt],
    steps: [
      t(
        "三文鱼两面撒少许盐，静置 10 分钟后擦干水分。",
        "Salt both sides, rest 10 minutes and pat dry.",
        "鮭に塩をふって 10 分おき、水気を拭く。",
      ),
      t(
        "用烤鱼架或平底锅中火煎至两面金黄熟透。",
        "Grill or pan-fry over medium heat until golden and cooked through.",
        "グリルかフライパンで両面をこんがり焼く。",
      ),
    ],
  }),
  recipe({
    id: "recipe_miso_mackerel",
    name: t("味噌煮青花鱼", "Mackerel simmered in miso", "鯖の味噌煮"),
    servings: 2,
    timeMinutes: 25,
    tags: ["japanese", "fish"],
    ingredients: [line("mackerel", "mackerel_raw", 300, { form: "fillet" })],
    seasonings: [SEASONING.miso, SEASONING.ginger, SEASONING.sugar, SEASONING.sake],
    steps: [
      t(
        "青花鱼切块，皮上划刀，用热水快速烫一下去腥。",
        "Cut the mackerel, score the skin and blanch briefly to remove odour.",
        "鯖を切り、皮に切り込みを入れて霜降りにする。",
      ),
      t(
        "锅中加水、料酒、砂糖和姜片煮开，放入鱼块。",
        "Boil water, sake, sugar and ginger, then add the fish.",
        "水・酒・砂糖・生姜を煮立て、鯖を入れる。",
      ),
      t(
        "盖上锅盖煮 10 分钟，化入味噌再煮至汤汁浓稠。",
        "Simmer covered for 10 minutes, dissolve the miso and reduce.",
        "落としぶたで 10 分煮て、味噌を溶き入れ煮詰める。",
      ),
    ],
  }),
  recipe({
    id: "recipe_mapo_tofu",
    name: t("麻婆豆腐", "Mapo tofu", "麻婆豆腐"),
    servings: 2,
    timeMinutes: 20,
    tags: ["chinese", "tofu"],
    ingredients: [
      line("tofu", "tofu_momen", 300, { alternatives: [{ ingredientId: "tofu_kinu" }] }),
      line("mince", "pork_ground_raw", 120, {
        alternatives: [{ ingredientId: "beef_ground_raw" }, { ingredientId: "chicken_ground_raw" }],
      }),
    ],
    seasonings: [
      SEASONING.doubanjiang,
      SEASONING.tianmianjiang,
      SEASONING.garlic,
      SEASONING.ginger,
      SEASONING.starch,
      SEASONING.oil,
    ],
    steps: [
      t(
        "豆腐切丁，用淡盐水焯一下。",
        "Dice the tofu and blanch in lightly salted water.",
        "豆腐を角切りにし、塩ゆでする。",
      ),
      t(
        "热油炒散肉末，加蒜姜末和豆瓣酱炒出红油。",
        "Fry the mince, then add garlic, ginger and doubanjiang until fragrant.",
        "ひき肉を炒め、にんにく・生姜・豆板醤を加えて香りを出す。",
      ),
      t(
        "加入甜面酱和少量水煮开，放入豆腐煮 3 分钟。",
        "Add sweet bean paste and a little water, then simmer the tofu for 3 minutes.",
        "甜麺醤と水を加えて煮立て、豆腐を 3 分煮る。",
      ),
      t("用水淀粉勾芡即可。", "Thicken with starch slurry.", "水溶き片栗粉でとろみをつける。"),
    ],
  }),
  recipe({
    id: "recipe_miso_soup",
    name: t("豆腐菌菇味噌汤", "Miso soup with tofu and mushrooms", "豆腐ときのこの味噌汁"),
    servings: 2,
    timeMinutes: 10,
    tags: ["japanese", "soup"],
    ingredients: [
      line("tofu", "tofu_kinu", 150, { alternatives: [{ ingredientId: "tofu_momen" }] }),
      line("shimeji", "shimeji_raw", 50, { optional: true }),
      line("enoki", "enoki_raw", 50, { optional: true }),
    ],
    seasonings: [SEASONING.dashi, SEASONING.miso],
    steps: [
      t(
        "高汤煮开，放入切好的菌菇煮 2 分钟。",
        "Bring the dashi to a boil and cook the mushrooms for 2 minutes.",
        "だしを温め、きのこを 2 分煮る。",
      ),
      t(
        "加入豆腐丁，关小火化入味噌，不要再煮沸。",
        "Add the tofu, lower the heat and dissolve the miso without boiling.",
        "豆腐を加え、火を弱めて味噌を溶く（煮立てない）。",
      ),
    ],
  }),
  recipe({
    id: "recipe_beef_steak",
    name: t("香煎牛排", "Pan-seared beef steak", "ビーフステーキ"),
    servings: 1,
    timeMinutes: 15,
    tags: ["western", "beef"],
    ingredients: [line("beef", "beef_sirloin_raw", 250, { anySpecies: "beef", form: "steak" })],
    seasonings: [SEASONING.salt, SEASONING.pepper, SEASONING.oil, SEASONING.butter],
    steps: [
      t(
        "牛排提前 30 分钟取出回温，擦干后撒盐和胡椒。",
        "Bring the steak to room temperature for 30 minutes, pat dry and season.",
        "肉を 30 分ほど常温に戻し、水気を拭いて塩こしょうする。",
      ),
      t(
        "大火热锅下油，每面煎 1–3 分钟（视厚度调整）。",
        "Sear in a very hot pan for 1–3 minutes per side, depending on thickness.",
        "強火で片面 1〜3 分ずつ焼く（厚みで調整）。",
      ),
      t(
        "可加黄油淋面，出锅静置 5 分钟再切。",
        "Baste with butter if you like, then rest for 5 minutes before slicing.",
        "お好みでバターを回しかけ、5 分休ませてから切る。",
      ),
    ],
  }),
  recipe({
    id: "recipe_japanese_curry",
    name: t("日式咖喱饭", "Japanese curry rice", "カレーライス"),
    servings: 2,
    timeMinutes: 45,
    tags: ["japanese", "rice_bowl"],
    ingredients: [
      line("meat", "pork_shoulder_loin_raw", 250, {
        anySpecies: "pork",
        form: "diced",
        alternatives: [
          { ingredientId: "chicken_thigh_skin_on_raw" },
          { ingredientId: "beef_round_raw" },
        ],
      }),
      line("onion", "onion_raw", 200, { count: 1 }),
      line("carrot", "carrot_raw", 100),
      line("rice", "rice_cooked", 400, { alternatives: RICE_OPTIONS }),
    ],
    seasonings: [SEASONING.curryRoux, SEASONING.oil],
    steps: [
      t(
        "肉、洋葱、胡萝卜切块。",
        "Cut the meat, onion and carrot into chunks.",
        "肉・玉ねぎ・にんじんを一口大に切る。",
      ),
      t(
        "热油炒肉和蔬菜，加水煮开撇去浮沫，小火煮 20 分钟。",
        "Brown the meat and vegetables, add water, skim and simmer for 20 minutes.",
        "肉と野菜を炒め、水を加えてアクを取り 20 分煮る。",
      ),
      t(
        "关火放入咖喱块化开，再小火煮至浓稠。",
        "Turn off the heat, dissolve the roux, then simmer until thick.",
        "火を止めてルウを溶かし、弱火でとろみがつくまで煮る。",
      ),
      t("浇在米饭上。", "Serve over rice.", "ごはんにかける。"),
    ],
  }),
  recipe({
    id: "recipe_yaki_udon",
    name: t("日式炒乌冬", "Yaki udon (stir-fried udon)", "焼うどん"),
    servings: 2,
    timeMinutes: 15,
    tags: ["japanese", "noodles"],
    ingredients: [
      line("udon", "udon_cooked", 400, { count: 2 }),
      line("pork", "pork_belly_raw", 100, { anySpecies: "pork", form: "thin_slice" }),
      line("cabbage", "cabbage_raw", 150),
      line("carrot", "carrot_raw", 50, { optional: true }),
      line("shiitake", "shiitake_raw", 30, { optional: true }),
    ],
    seasonings: [SEASONING.soySauce, SEASONING.oysterSauce, SEASONING.oil, SEASONING.bonito],
    steps: [
      t(
        "猪肉切小片，蔬菜切丝或片。",
        "Cut the pork into pieces and slice the vegetables.",
        "豚肉と野菜を食べやすく切る。",
      ),
      t("乌冬用热水烫散备用。", "Loosen the udon in hot water.", "うどんは湯通ししてほぐす。"),
      t(
        "热油炒猪肉和蔬菜，加入乌冬翻炒。",
        "Stir-fry the pork and vegetables, then add the udon.",
        "豚肉と野菜を炒め、うどんを加える。",
      ),
      t(
        "用酱油和蚝油调味，撒上木鱼花。",
        "Season with soy and oyster sauce; top with bonito flakes.",
        "醤油とオイスターソースで味付けし、かつお節をのせる。",
      ),
    ],
  }),
  recipe({
    id: "recipe_spinach_ohitashi",
    name: t("日式凉拌菠菜", "Spinach ohitashi", "ほうれん草のおひたし"),
    servings: 2,
    timeMinutes: 10,
    tags: ["japanese", "vegetable"],
    ingredients: [
      line("greens", "spinach_raw", 200, { alternatives: [{ ingredientId: "komatsuna_raw" }] }),
    ],
    seasonings: [SEASONING.dashi, SEASONING.soySauce, SEASONING.bonito],
    steps: [
      t(
        "菠菜洗净，沸水烫 1 分钟后过冷水。",
        "Blanch the spinach for 1 minute and cool in cold water.",
        "ほうれん草を 1 分ゆでて冷水にとる。",
      ),
      t(
        "挤干水分切段，淋上高汤酱油，撒木鱼花。",
        "Squeeze dry, cut, dress with dashi and soy sauce, top with bonito flakes.",
        "水気を絞って切り、だし醤油をかけてかつお節をのせる。",
      ),
    ],
  }),
  recipe({
    id: "recipe_komatsuna_egg",
    name: t("小松菜炒鸡蛋", "Komatsuna and egg stir-fry", "小松菜と卵の炒め物"),
    servings: 2,
    timeMinutes: 10,
    tags: ["vegetable", "egg"],
    ingredients: [
      line("greens", "komatsuna_raw", 200, { alternatives: [{ ingredientId: "spinach_raw" }] }),
      line("egg", "egg_whole", 100, { count: 2 }),
    ],
    seasonings: [SEASONING.salt, SEASONING.oil, SEASONING.soySauce],
    steps: [
      t(
        "鸡蛋打散，热油炒成大块后盛出。",
        "Scramble the eggs in hot oil into large curds and set aside.",
        "卵を溶き、油でふんわり炒めて取り出す。",
      ),
      t(
        "小松菜切段，先炒茎再炒叶。",
        "Cut the komatsuna; fry the stems first, then the leaves.",
        "小松菜を切り、茎、葉の順に炒める。",
      ),
      t(
        "倒回鸡蛋，加盐和少许酱油翻匀。",
        "Return the eggs, season with salt and a little soy sauce.",
        "卵を戻し、塩と醤油少々で味を調える。",
      ),
    ],
  }),
  recipe({
    id: "recipe_gyudon",
    name: t("牛丼", "Gyudon (beef rice bowl)", "牛丼"),
    servings: 2,
    timeMinutes: 20,
    tags: ["japanese", "beef", "rice_bowl"],
    ingredients: [
      line("beef", "beef_belly_raw", 200, { anySpecies: "beef", form: "thin_slice" }),
      line("onion", "onion_raw", 150),
      line("rice", "rice_cooked", 400, { alternatives: RICE_OPTIONS }),
    ],
    seasonings: [
      SEASONING.dashi,
      SEASONING.soySauce,
      SEASONING.mirin,
      SEASONING.sugar,
      SEASONING.sake,
    ],
    steps: [
      t(
        "洋葱切丝，牛肉切成适口大小。",
        "Slice the onion and cut the beef into bite-sized pieces.",
        "玉ねぎを薄切り、牛肉を食べやすく切る。",
      ),
      t(
        "高汤与调味料煮开，先煮洋葱至软。",
        "Boil dashi with the seasonings and cook the onion until soft.",
        "だしと調味料を煮立て、玉ねぎを柔らかく煮る。",
      ),
      t(
        "放入牛肉煮至变色，撇去浮沫。",
        "Add the beef, cook until it changes colour and skim.",
        "牛肉を加えて色が変わるまで煮て、アクを取る。",
      ),
      t("连汤汁盖在米饭上。", "Spoon over rice with some of the broth.", "汁ごとごはんにのせる。"),
    ],
  }),
  recipe({
    id: "recipe_egg_fried_rice",
    name: t("鸡蛋炒饭", "Egg fried rice", "卵チャーハン"),
    servings: 2,
    timeMinutes: 15,
    tags: ["chinese", "rice", "egg"],
    ingredients: [
      line("rice", "rice_cooked", 400, { alternatives: RICE_OPTIONS }),
      line("egg", "egg_whole", 100, { count: 2 }),
      line("onion", "onion_raw", 50, { optional: true }),
      line("carrot", "carrot_raw", 30, { optional: true }),
    ],
    seasonings: [SEASONING.salt, SEASONING.pepper, SEASONING.soySauce, SEASONING.oil],
    steps: [
      t(
        "洋葱、胡萝卜切碎，鸡蛋打散。",
        "Finely chop the onion and carrot; beat the eggs.",
        "玉ねぎとにんじんをみじん切りにし、卵を溶く。",
      ),
      t(
        "大火热油，倒入蛋液后立刻加入米饭快速翻炒。",
        "Pour the eggs into very hot oil and immediately add the rice, tossing quickly.",
        "強火で卵を流し入れ、すぐにごはんを加えて炒める。",
      ),
      t(
        "加入蔬菜炒匀，用盐、胡椒和锅边淋酱油调味。",
        "Add the vegetables and season with salt, pepper and a splash of soy sauce.",
        "野菜を加え、塩こしょうと鍋肌から醤油で味付けする。",
      ),
    ],
  }),
  recipe({
    id: "recipe_twice_cooked_pork",
    name: t("回锅肉", "Twice-cooked pork with cabbage", "回鍋肉（ホイコーロー）"),
    servings: 2,
    timeMinutes: 25,
    tags: ["chinese", "pork"],
    ingredients: [
      line("pork", "pork_belly_raw", 250, { anySpecies: "pork", form: "thin_slice" }),
      line("cabbage", "cabbage_raw", 250),
      line("pepper", "green_pepper_raw", 70, { count: 2, optional: true }),
    ],
    seasonings: [
      SEASONING.doubanjiang,
      SEASONING.tianmianjiang,
      SEASONING.garlic,
      SEASONING.soySauce,
      SEASONING.oil,
    ],
    steps: [
      t(
        "卷心菜和青椒切大块。",
        "Cut the cabbage and peppers into large pieces.",
        "キャベツとピーマンをざく切りにする。",
      ),
      t(
        "猪肉炒至出油微焦，盛出。",
        "Fry the pork until it renders and browns; set aside.",
        "豚肉を脂が出るまで炒めて取り出す。",
      ),
      t(
        "用锅中余油炒豆瓣酱、甜面酱和蒜，倒回猪肉和蔬菜大火快炒。",
        "Fry the pastes and garlic in the fat, return the pork and toss with the vegetables over high heat.",
        "残った油で豆板醤・甜麺醤・にんにくを炒め、豚肉と野菜を強火で炒め合わせる。",
      ),
    ],
  }),
  recipe({
    id: "recipe_chicken_teriyaki",
    name: t("照烧鸡腿", "Chicken teriyaki", "鶏の照り焼き"),
    servings: 2,
    timeMinutes: 20,
    tags: ["japanese", "chicken"],
    ingredients: [line("chicken", "chicken_thigh_skin_on_raw", 300)],
    seasonings: [SEASONING.soySauce, SEASONING.mirin, SEASONING.sugar, SEASONING.sake],
    steps: [
      t(
        "鸡腿肉用叉子扎孔，皮朝下放入冷锅中火煎至金黄。",
        "Prick the chicken, then cook skin side down from a cold pan over medium heat until golden.",
        "鶏肉をフォークで刺し、皮目から中火でこんがり焼く。",
      ),
      t(
        "翻面盖盖焖 5 分钟至熟透，擦去多余油脂。",
        "Turn, cover and cook for 5 minutes; wipe away excess fat.",
        "裏返してふたをし 5 分蒸し焼きにし、余分な脂を拭く。",
      ),
      t(
        "倒入调好的酱汁，收汁至光亮，切块装盘。",
        "Add the sauce and reduce until glossy; slice to serve.",
        "合わせ調味料を加えて照りが出るまで煮詰め、切り分ける。",
      ),
    ],
  }),
];

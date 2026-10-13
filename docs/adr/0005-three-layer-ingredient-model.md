# ADR 0005: Three-layer ingredient model

Status: accepted (V0.1; written down in V0.3)

## Problem

A supermarket pack in Japan is labelled like "牛ミスジ ステーキ用 251 g". That one label mixes
three different things: what the food is (beef misuji, which decides nutrition), how it was cut
or packed (a steak, yakiniku slices, ground), and the physical pack in the fridge (251 g, bought
on a date, expiring on another). A single "food item" record either loses one of them or
duplicates nutrition for every cut and pack size. Recipes also need to ask "is there beef I can
slice?", not "is there exactly this product?".

## Decision

- **IngredientDefinition** is the nutrition identity: name in three languages, aliases,
  category, animal species and anatomical cut, edible ratio for bone-in or whole items,
  nutrition per 100 g edible portion (or `null` when unknown), unit conversion estimates and a
  data source. Two cuts with different nutrition are two definitions (`beef_misuji_raw`,
  `beef_sirloin_raw`). Built-in definitions have stable snake_case IDs.
- **ProductForm** is an enum on the lot (steak, thin slices, ground, block, whole…). It
  describes preparation and never changes nutrition per 100 g.
- **InventoryLot** is one physical pack: definition ID, form, the cut as labelled, weight
  and/or count with unit, thickness, bone-in and skin flags, processing, dates, storage,
  price, and the raw label text.
- Japanese supermarket wording is parsed into these enums (`japaneseLabels.ts`) as an input
  aid only; business logic reads the enums.
- Recipes reference definitions. A line can accept alternatives or any cut of the same species,
  and `compatibility.ts` decides which forms can be prepared into the wanted form (a block can
  be sliced, ground meat is never a steak).

## Alternatives considered

- **One table of products** (each pack size and cut its own item with nutrition). Rejected:
  nutrition is duplicated and drifts, and matching cannot reason about cuts or forms.
- **Form as part of the definition** (`beef_misuji_steak`). Rejected: the form does not change
  nutrition, and the number of definitions would multiply.
- **Free-text labels only.** Rejected: search and matching would depend on wording, across
  three languages.

## Costs

- A food with no definition yet needs a custom definition before a lot can be added.
- The form compatibility table is small and fixed; it knows nothing about specific dishes.
- A fallback definition ("beef, unspecified cut") keeps the labelled cut on the lot, so the
  lot's cut and the definition's cut can differ.

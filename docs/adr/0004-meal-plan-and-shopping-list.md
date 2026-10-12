# ADR 0004: Meal plan and shopping list

Status: proposed (V0.3, part 2)

## Problem

Matching was per recipe: each recipe saw the whole inventory. Planning two dishes that both need
onion therefore double-counted it. With 100 g of onion and two dishes needing 80 g each, both
looked ready, and a shopping list built by adding up per-recipe gaps would say "nothing to buy"
instead of 60 g. A ticked shopping item also must not become stock: what was actually bought
(pack size, cut, expiry date) is only known after the trip.

## Decision

- `matchPlan(dishes, context)` runs the shared allocator (ADR 0002) once over all planned dishes
  with one ledger. Required lines are ordered by candidate count, then dish order, then line
  index, so an earlier dish wins a contested lot. `matchRecipe` is `matchPlan` with one dish;
  single-recipe results are unchanged.
- The shopping list is derived, never stored: `buildShoppingList` takes the plan matches and
  produces
  - **gaps**: required lines with a known shortfall, merged per ingredient to buy. A line with
    alternatives buys the ingredient the user picked (default: the primary), converted by the
    alternative's ratio. The gap is rounded up to whole grams; `approxPieces` comes from the
    ingredient's piece conversion;
  - **to confirm**: lines whose stock cannot be decided (a lot records no usable quantity, or
    shared stock may not suffice); they are never counted as gaps;
  - **seasonings**: checked by eye, deduplicated by name, never computed from stock.
    Optional lines are left out.
- Migration 0005 stores only user input:
  - `plan_entries` (recipe, servings, position, per-line buy choices as JSON);
  - `shopping_items`: the state of a derived gap (`source = 'plan'`, one row per ingredient,
    bought flag, planned grams, pack note) and manual items (`source = 'manual'`, free text).
    Recipe and ingredient references are weak: a deleted recipe's entry is removed with the
    recipe, an ingredient missing from the list leaves an unused state row.
- Planning never changes inventory. "Bought" is a mark only. "Enter stock" opens the normal
  add-lot form with the ingredient preset and the weight empty; the user types the actual pack
  and dates. Saving clears that gap's stored state.
- Cooking from the plan passes `planEntryId`; the entry is deleted in the same atomic batch as
  the deductions and the session (ADR 0001, 0003). When the last entry goes, gap states go too.
- Backup schema 4 adds `planEntries` and `shoppingItems`; v1–v3 upgrade with empty lists. Import
  rejects duplicate IDs and plan items whose ID does not match their ingredient.

## Alternatives considered

- **Sum per-recipe gaps.** Rejected: double-counts shared stock (the 60 g case).
- **Store the generated list.** Rejected: it goes stale as soon as stock, servings or recipes
  change, and needs a reconcile step. Storing user input only keeps one source of truth.
- **Ticking "bought" adds stock.** Rejected: the planned amount is not what was bought.
- **Reserve stock for planned dishes.** Rejected for now: adds a second ledger the user must
  release by hand; the plan is an intention, not a commitment.

## Costs

- Gap grams are edible grams of the recipe's form. For bone-in cuts the purchase weight is
  higher; the list says how much is needed, not how much to buy.
- "Available" for a merged ingredient can include lots allocated through alternatives or
  any-cut lines, so it may differ from the stock page's total for that ingredient.
- Manual items cannot be entered into stock directly; they have no ingredient.
- Gap states survive removing a single dish until the plan is empty; a state for an ingredient
  no longer on the list is kept but not shown.

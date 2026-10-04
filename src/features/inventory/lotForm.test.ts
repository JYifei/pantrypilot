import { describe, expect, it } from "vitest";
import { emptyLotForm, formValuesToLotInput, lotFormSchema, lotToFormValues } from "./lotForm";

const base = emptyLotForm({ currency: "JPY", today: "2026-10-04" });

describe("lot form", () => {
  it("converts the misuji acceptance example", () => {
    const values = {
      ...base,
      ingredientDefinitionId: "beef_misuji_raw",
      cut: "misuji" as const,
      form: "steak" as const,
      weightG: "251",
      thicknessMm: "35",
      price: "940",
      expirationDate: "2026-10-07",
    };
    expect(lotFormSchema.safeParse(values).success).toBe(true);
    expect(formValuesToLotInput(values, "add")).toMatchObject({
      ingredientDefinitionId: "beef_misuji_raw",
      cut: "misuji",
      form: "steak",
      originalWeightG: 251,
      remainingWeightG: 251,
      thicknessMm: 35,
      purchasePrice: 940,
      currency: "JPY",
      storage: "refrigerated",
      purchaseDate: "2026-10-04",
      expirationDate: "2026-10-07",
    });
  });

  it("requires a food and a positive weight", () => {
    const result = lotFormSchema.safeParse(base);
    expect(result.success).toBe(false);
    const messages = result.error?.issues.map((i) => i.message);
    expect(messages).toContain("validation.foodRequired");
    expect(messages).toContain("validation.positiveNumber");
  });

  it("keeps empty optional numbers undefined instead of 0", () => {
    const input = formValuesToLotInput(
      { ...base, ingredientDefinitionId: "x", weightG: "100" },
      "add",
    );
    expect(input.thicknessMm).toBeUndefined();
    expect(input.purchasePrice).toBeUndefined();
    expect(input.currency).toBeUndefined();
  });

  it("supports count-based lots", () => {
    const values = {
      ...base,
      ingredientDefinitionId: "komatsuna_raw",
      quantityMode: "count" as const,
      count: "1",
      unit: "bag" as const,
    };
    expect(lotFormSchema.safeParse(values).success).toBe(true);
    expect(formValuesToLotInput(values, "add")).toMatchObject({
      count: 1,
      unit: "bag",
      remainingWeightG: undefined,
    });
  });

  it("round-trips an existing lot for editing and clamps remaining to original", () => {
    const lot = {
      ...formValuesToLotInput({ ...base, ingredientDefinitionId: "x", weightG: "251" }, "add"),
      remainingWeightG: 151,
      id: "l",
      createdAt: "",
      updatedAt: "",
    };
    const values = lotToFormValues(lot, "JPY");
    expect(values.weightG).toBe("251");
    expect(values.remainingWeightG).toBe("151");
    expect(formValuesToLotInput(values, "edit").remainingWeightG).toBe(151);
    expect(
      formValuesToLotInput({ ...values, remainingWeightG: "999" }, "edit").remainingWeightG,
    ).toBe(251);
  });
});

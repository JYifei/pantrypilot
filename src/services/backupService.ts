import { createBackup, findBackupReferenceProblems, type BackupFile } from "@/domain/backup/backup";
import type { Repositories } from "@/repositories";
import { clockNow, systemClock, type Clock } from "./clock";

export type ImportResult =
  | {
      ok: true;
      counts: { ingredients: number; inventoryLots: number; transactions: number; recipes: number };
    }
  | { ok: false; problems: string[] };

/**
 * Export / import of all user data as a single JSON document.
 * Built-in ingredients and recipes are not exported: they ship with the app
 * and are referenced by their stable IDs.
 */
export class BackupService {
  constructor(
    private readonly repos: Repositories,
    private readonly clock: Clock = systemClock,
  ) {}

  /** Reads everything while writes are paused, so lots and transactions match. */
  async exportAll(): Promise<BackupFile> {
    const [ingredients, inventoryLots, transactions, recipes, settings] =
      await this.repos.readConsistent(() =>
        Promise.all([
          this.repos.ingredients.listUserCreated(),
          this.repos.inventory.listLots(),
          this.repos.inventory.listTransactions(),
          this.repos.recipes.listUserCreated(),
          this.repos.settings.load(),
        ]),
      );
    return createBackup(
      { ingredients, inventoryLots, transactions, recipes, settings },
      clockNow(this.clock),
    );
  }

  /**
   * Replace all user data with the backup's contents. The backup must already
   * be parsed, migrated and validated (see parseBackup); reference checks run
   * here before anything is written. Deleting the old data and writing the new
   * data happen in one database transaction, so a failure keeps the old data.
   */
  async importReplacingAll(backup: BackupFile): Promise<ImportResult> {
    const builtinIds = new Set(
      (await this.repos.ingredients.listAll()).filter((d) => d.isBuiltin).map((d) => d.id),
    );
    const builtinRecipeIds = new Set(
      (await this.repos.recipes.listAll()).filter((r) => r.isBuiltin).map((r) => r.id),
    );
    const problems = findBackupReferenceProblems(backup, builtinIds);
    for (const ingredient of backup.data.ingredients) {
      if (builtinIds.has(ingredient.id)) {
        problems.push(`ingredient ${ingredient.id} collides with a built-in ID`);
      }
    }
    for (const recipe of backup.data.recipes) {
      if (builtinRecipeIds.has(recipe.id)) {
        problems.push(`recipe ${recipe.id} collides with a built-in ID`);
      }
    }
    if (problems.length > 0) return { ok: false, problems };

    await this.repos.atomic(async (tx) => {
      await tx.inventory.deleteAll();
      await tx.recipes.deleteAllUserCreated();
      await tx.ingredients.deleteAllUserCreated();
      await tx.operations.deleteAll();

      for (const ingredient of backup.data.ingredients) {
        await tx.ingredients.save({ ...ingredient, isBuiltin: false });
      }
      for (const recipe of backup.data.recipes) {
        await tx.recipes.save({ ...recipe, isBuiltin: false });
      }
      for (const lot of backup.data.inventoryLots) {
        await tx.inventory.saveLot(lot);
      }
      for (const transaction of backup.data.transactions) {
        await tx.inventory.addTransaction(transaction);
      }
      await tx.settings.save(backup.data.settings);
    });

    return {
      ok: true,
      counts: {
        ingredients: backup.data.ingredients.length,
        inventoryLots: backup.data.inventoryLots.length,
        transactions: backup.data.transactions.length,
        recipes: backup.data.recipes.length,
      },
    };
  }
}

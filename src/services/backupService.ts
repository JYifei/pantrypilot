import { createBackup, findBackupReferenceProblems, type BackupFile } from "@/domain/backup/backup";
import type { Repositories } from "@/repositories";
import { clockNow, systemClock, type Clock } from "./clock";

export type ImportResult =
  | {
      ok: true;
      counts: { ingredients: number; inventoryLots: number; transactions: number };
    }
  | { ok: false; problems: string[] };

/**
 * Export / import of all user data as a single JSON document.
 * Built-in ingredients are not exported: they ship with the app and are
 * referenced by their stable IDs.
 */
export class BackupService {
  constructor(
    private readonly repos: Repositories,
    private readonly clock: Clock = systemClock,
  ) {}

  async exportAll(): Promise<BackupFile> {
    const [ingredients, inventoryLots, transactions, settings] = await Promise.all([
      this.repos.ingredients.listUserCreated(),
      this.repos.inventory.listLots(),
      this.repos.inventory.listTransactions(),
      this.repos.settings.load(),
    ]);
    return createBackup(
      { ingredients, inventoryLots, transactions, settings },
      clockNow(this.clock),
    );
  }

  /**
   * Replace all user data with the backup's contents. The backup must already
   * be parsed and validated (see parseBackup). All reference checks run before
   * anything is deleted.
   */
  async importReplacingAll(backup: BackupFile): Promise<ImportResult> {
    const builtinIds = new Set(
      (await this.repos.ingredients.listAll()).filter((d) => d.isBuiltin).map((d) => d.id),
    );
    const problems = findBackupReferenceProblems(backup, builtinIds);
    for (const ingredient of backup.data.ingredients) {
      if (builtinIds.has(ingredient.id)) {
        problems.push(`ingredient ${ingredient.id} collides with a built-in ID`);
      }
    }
    if (problems.length > 0) return { ok: false, problems };

    await this.repos.inventory.deleteAll();
    await this.repos.ingredients.deleteAllUserCreated();

    for (const ingredient of backup.data.ingredients) {
      await this.repos.ingredients.save({ ...ingredient, isBuiltin: false });
    }
    for (const lot of backup.data.inventoryLots) {
      await this.repos.inventory.saveLot(lot);
    }
    for (const transaction of backup.data.transactions) {
      await this.repos.inventory.addTransaction(transaction);
    }
    await this.repos.settings.save(backup.data.settings);

    return {
      ok: true,
      counts: {
        ingredients: backup.data.ingredients.length,
        inventoryLots: backup.data.inventoryLots.length,
        transactions: backup.data.transactions.length,
      },
    };
  }
}

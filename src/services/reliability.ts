import { StaleWriteError } from "@/db/database";

/** Service input rejected before anything was written. */
export class InvalidInputError extends Error {
  constructor(readonly problems: string[]) {
    super(`Invalid input: ${problems.join("; ")}`);
    this.name = "InvalidInputError";
  }
}

/** How often a read-validate-write attempt is retried after a concurrent change. */
export const STALE_WRITE_ATTEMPTS = 3;

/**
 * Run a read → validate → guarded write attempt, starting over with fresh
 * data when a guarded write finds the row changed in the meantime.
 */
export async function retryOnStaleWrite<T>(attempt: () => Promise<T>): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await attempt();
    } catch (error) {
      if (!(error instanceof StaleWriteError) || i >= STALE_WRITE_ATTEMPTS) throw error;
    }
  }
}

/**
 * In-process mutex that serialises this app's database writes. The app is the
 * only writer to its database file, so holding the lock also gives readers a
 * stable view (see SqlDatabase.withWritesPaused).
 */
export function createWriteLock() {
  let tail: Promise<unknown> = Promise.resolve();
  return function run<T>(task: () => Promise<T>): Promise<T> {
    const result = tail.then(task);
    tail = result.catch(() => undefined);
    return result;
  };
}

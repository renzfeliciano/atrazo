/**
 * Asks the browser to keep Atrazo's data on this phone instead of clearing it when space runs low
 * (or, on iPhone Safari, after a week without a visit). Entries not yet backed up live only here,
 * so losing them silently would lose the lender's records.
 *
 * Nothing is collected or sent: the data stays where it is, and signing out, Delete listahan or
 * clearing the site's data still removes it. Browsers decide on their own whether to grant this
 * (Chrome grants it to installed or often-used apps; Firefox may ask once), so a "no" is fine.
 */
export async function keepDataOnThisPhone(
  storage: Pick<StorageManager, "persist" | "persisted"> | undefined = globalThis.navigator
    ?.storage,
): Promise<boolean> {
  try {
    if (!storage?.persist || !storage.persisted) return false;
    return (await storage.persisted()) || (await storage.persist());
  } catch {
    return false;
  }
}

import { currentSetsKey, readCurrentSets } from './current-sets.ts';
import { readSavedTeams, storageKey } from './workbench.ts';

function rewrite(
  storage: Storage,
  key: string,
  read: (target: Pick<Storage, 'getItem'>) => unknown[]
) {
  try {
    const raw = storage.getItem(key);
    if (raw === null) return;
    const next = JSON.stringify(read(storage));
    if (next !== raw) storage.setItem(key, next);
  } catch {
    return;
  }
}

export function migrateStoredData(storage: Storage) {
  rewrite(storage, storageKey, readSavedTeams);
  rewrite(storage, currentSetsKey, readCurrentSets);
}

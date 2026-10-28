import { onMount } from 'svelte';
import {
  currentSetsChangedEvent,
  readCurrentSets,
  type CurrentSet,
} from './current-sets.ts';
import { sync } from './sync.svelte';

const ownerKey = 'champions-atlas:sync-owner:v2';
const ownershipError = 'Sync account changed. Reopen My teams to continue.';

export function currentSetOwnerMatches(): boolean {
  if (!sync.configured) return true;
  const owner = localStorage.getItem(ownerKey);
  const user = sync.user;
  if (!user) return owner === null;
  const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID;
  return !!projectId && owner === `${projectId}:${user.uid}`;
}

export function createCurrentSetRegistry() {
  let sets = $state<CurrentSet[] | null>(null);
  let error = $state('');

  function refresh(): CurrentSet[] | null {
    try {
      if (!currentSetOwnerMatches()) {
        sets = null;
        error = ownershipError;
        return null;
      }
      const latest = readCurrentSets(localStorage);
      sets = latest;
      error = '';
      return latest;
    } catch (caught) {
      sets = null;
      error = caught instanceof Error ? caught.message : String(caught);
      return null;
    }
  }

  $effect(() => {
    void sync.revision;
    void sync.authResolved;
    void sync.user;
    refresh();
  });

  onMount(() => {
    window.addEventListener(currentSetsChangedEvent, refresh);
    return () => {
      window.removeEventListener(currentSetsChangedEvent, refresh);
    };
  });

  return {
    get sets() {
      return sets;
    },
    get error() {
      return error;
    },
    refresh,
  };
}
